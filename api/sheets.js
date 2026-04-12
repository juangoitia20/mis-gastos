// api/sheets.js — Vercel Serverless Function
// Reemplaza todas las funciones de Code.gs
// Se comunica con Google Sheets via Service Account

import { google } from 'googleapis';

// ─── CONFIGURACIÓN (igual que Code.gs) ───────────────────────
const SS_ID = '1WgsyORjSzPU3fKW0pO6C0mIMyJhkbEh8tWqLDd8vlnM';

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
];

const CATEGORIES = [
  { name: 'INGRESOS',               startCol: 1  },
  { name: 'GASTOS ESENCIALES',      startCol: 6  },
  { name: 'GASTOS DISCRECIONALES',  startCol: 11 },
  { name: 'PAGO DE DEUDAS',         startCol: 16 },
  { name: 'AHORROS',                startCol: 21 },
  { name: 'INVERSIONES',            startCol: 26 },
];

const DATA_START_ROW = 59;

const SUBCATEGORIES = {
  'INGRESOS': [
    'Salario Juan','Cashback','Misceláneos (I)','Churupos',
    'F. Recreación (I)','F. Tranquilidad (I)','Intereses','Dev. Médicas'
  ],
  'GASTOS ESENCIALES': [
    'Arriendo','Teléfono Juan','Gas','Supermercado',
    'Tratamientos','Medicamentos','Transporte','Misceláneos (GE)'
  ],
  'GASTOS DISCRECIONALES': [
    'Dulces/Salados','Restaurantes','Misceláneos (GD)','Diezmo',
    'Remesas','Peluquería','Reuniones','Viajes','Suscripciones'
  ],
  'PAGO DE DEUDAS': [
    'Mant. CMR','Mant. Líder BCI','Paq1 AE x3 | Tenpo','KP Cto. x3 | Tenpo',
    'S-V Bus x3 | Tenpo','ZapOtros x6 | Tenpo','JuegOllas x6 | Líder',
    'LentesC x3 | RappiC','PieHipot x11 | PY','Micróf. x3 | Tenpo',
    'MP Dic25 x6 | Tenpo','Seg. Viaje x12 | MACH','Mant. Cuenta'
  ],
  'AHORROS': ['F. Recreación','F. Tranquilidad','Churupos','F. Hogar'],
  'INVERSIONES': ['Fintual Acciones','Binance Crypto']
};

// ─── AUTH: Service Account desde variable de entorno ─────────
function getAuth() {
  const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  return new google.auth.GoogleAuth({
    credentials: key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
}

async function getSheets() {
  const auth = getAuth();
  return google.sheets({ version: 'v4', auth });
}

// ─── HELPERS ─────────────────────────────────────────────────
function colLetter(n) {
  // 1→A, 2→B, 26→Z, 27→AA ...
  let s = '';
  while (n > 0) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

function rangeA1(sheet, startRow, startCol, numRows, numCols) {
  const c1 = colLetter(startCol);
  const c2 = colLetter(startCol + numCols - 1);
  return `${sheet}!${c1}${startRow}:${c2}${startRow + numRows - 1}`;
}

// Convierte número serial de Sheets a string ISO con hora fijada al mediodía UTC.
// Usar T12:00:00.000Z garantiza que en cualquier zona horaria (incluidos cambios
// horario invierno/verano de Chile) la fecha local sea siempre la correcta.
function serialToDateStr(v) {
  const pad = n => String(n).padStart(2, '0');
  let y, m, d;
  if (typeof v === 'number') {
    const utc = new Date((v - 25569) * 86400000);
    y = utc.getUTCFullYear(); m = utc.getUTCMonth() + 1; d = utc.getUTCDate();
  } else if (typeof v === 'string' && v.match(/^\d{4}-/)) {
    [y, m, d] = v.slice(0, 10).split('-').map(Number);
  } else if (v instanceof Date) {
    y = v.getUTCFullYear(); m = v.getUTCMonth() + 1; d = v.getUTCDate();
  } else {
    return null;
  }
  return `${y}-${pad(m)}-${pad(d)}T12:00:00.000Z`;
}

function buildSummary(transactions) {
  const ingresos = transactions
    .filter(t => t.category === 'INGRESOS')
    .reduce((s, t) => s + t.amount, 0);
  const egresos = transactions
    .filter(t => t.category !== 'INGRESOS')
    .reduce((s, t) => s + t.amount, 0);
  const byCategory = {};
  for (const cat of CATEGORIES) {
    byCategory[cat.name] = transactions
      .filter(t => t.category === cat.name)
      .reduce((s, t) => s + t.amount, 0);
  }
  return {
    ingresos, egresos,
    diferencia: ingresos - egresos,
    pctAhorro: ingresos > 0 ? ((ingresos - egresos) / ingresos) * 100 : 0,
    byCategory
  };
}

// ─── OPERACIONES ─────────────────────────────────────────────


// Lee el PIN de acceso único desde Puntuales!C30 del Sheet.
// Así el PIN es el mismo en todos los dispositivos y no se puede
// adivinar creando uno nuevo desde el dispositivo.
async function getPin() {
  const sheets = await getSheets();
  const res    = await sheets.spreadsheets.values.get({
    spreadsheetId: SS_ID,
    range: 'Puntuales!C30',
    valueRenderOption: 'UNFORMATTED_VALUE'
  });
  const pin = String(res.data.values?.[0]?.[0] ?? '').trim();
  return { pin };
}

async function getConfig() {
  return { subcategories: SUBCATEGORIES, categories: CATEGORIES.map(c => c.name) };
}

async function getMonthData(monthName) {
  const sheets = await getSheets();

  // Leer en un solo batch: transacciones + celdas de resumen calculadas por el sheet
  const [txRes, summaryRes] = await Promise.all([
    sheets.spreadsheets.values.get({
      spreadsheetId: SS_ID,
      range: `${monthName}!A${DATA_START_ROW}:AC`,
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'SERIAL_NUMBER'
    }),
    // G2=Egresos, Q2=Diferencia, A16=%Ahorro (celdas con fórmulas del sheet)
    sheets.spreadsheets.values.batchGet({
      spreadsheetId: SS_ID,
      ranges: [
        `${monthName}!G2`,   // Egresos
        `${monthName}!Q2`,   // Diferencia
        `${monthName}!A16`,  // % Ahorro
      ],
      valueRenderOption: 'UNFORMATTED_VALUE'
    })
  ]);

  // ── Parsear celdas de resumen ──────────────────────────────
  const sv = summaryRes.data.valueRanges;
  const egresos    = Number((sv[0]?.values?.[0]?.[0]) ?? 0);
  const diferencia = Number((sv[1]?.values?.[0]?.[0]) ?? 0);
  const pctRaw     = Number((sv[2]?.values?.[0]?.[0]) ?? 0);
  // El sheet puede guardar % como fracción (0.2092) o entero (20.92)
  const pctAhorro  = pctRaw <= 1 && pctRaw >= -1 ? pctRaw * 100 : pctRaw;
  const ingresos   = egresos + diferencia;  // Ingresos = Egresos + Diferencia

  // ── Parsear transacciones ──────────────────────────────────
  const rows = txRes.data.values || [];
  const transactions = [];

  for (const cat of CATEGORIES) {
    const offset = cat.startCol - 1;
    for (let i = 0; i < rows.length; i++) {
      const row    = rows[i];
      const subcat = row[offset];
      const fecha  = row[offset + 1];
      const monto  = row[offset + 2];
      const nota   = row[offset + 3];
      if (!subcat && !monto) continue;

      const dateStr = serialToDateStr(fecha);
      transactions.push({
        id:          cat.name + '_' + (DATA_START_ROW + i),
        category:    cat.name,
        subcategory: String(subcat || ''),
        date:        dateStr || String(fecha || ''),
        amount:      Number(monto) || 0,
        note:        String(nota || ''),
        row:         DATA_START_ROW + i,
        startCol:    cat.startCol,
        sheetName:   monthName
      });
    }
  }

  transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

  // byCategory sigue calculándose desde transacciones (detalle correcto)
  const byCategory = {};
  for (const cat of CATEGORIES) {
    byCategory[cat.name] = transactions
      .filter(t => t.category === cat.name)
      .reduce((s, t) => s + t.amount, 0);
  }

  return {
    transactions,
    summary: { ingresos, egresos, diferencia, pctAhorro, byCategory }
  };
}

async function getAnnualSummary() {
  const sheets = await getSheets();

  // Leer G2 (Egresos) y Q2 (Diferencia) de cada hoja mensual en un solo batch.
  // Mismas celdas que usa getMonthData, garantizando consistencia.
  const ranges = MONTHS.flatMap(m => [`${m}!G2`, `${m}!Q2`]);

  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: SS_ID,
    ranges,
    valueRenderOption: 'UNFORMATTED_VALUE'
  });

  const vr = res.data.valueRanges;
  const months = MONTHS.map((month, i) => {
    const egresos    = Number(vr[i * 2    ]?.values?.[0]?.[0] ?? 0);
    const diferencia = Number(vr[i * 2 + 1]?.values?.[0]?.[0] ?? 0);
    const ingresos   = egresos + diferencia;
    return { month, ingresos, egresos, diferencia };
  });

  return { months };
}

async function saveTransaction(data) {
  const { category, subcategory, date, amount, note } = data;
  if (!category || !subcategory || !date || amount === undefined)
    throw new Error('Faltan campos obligatorios.');

  const d         = new Date(date);
  const sheetName = MONTHS[d.getMonth()];
  const cat       = CATEGORIES.find(c => c.name === category);
  if (!cat) throw new Error('Categoría no válida: ' + category);

  const col     = cat.startCol;
  const sheets  = await getSheets();

  // Buscar primera fila vacía
  const searchRange = `${sheetName}!${colLetter(col)}${DATA_START_ROW}:${colLetter(col)}${DATA_START_ROW + 299}`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SS_ID, range: searchRange,
    valueRenderOption: 'UNFORMATTED_VALUE'
  });
  const colVals = res.data.values || [];
  let targetRow = DATA_START_ROW + 299;
  for (let i = 0; i < 300; i++) {
    if (!colVals[i] || !colVals[i][0]) { targetRow = DATA_START_ROW + i; break; }
  }

  // Formatear fecha para Sheets (DD/MM/YYYY)
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const yyyy = d.getFullYear();
  const dateStr = `${mm}/${dd}/${yyyy}`;

  const writeRange = `${sheetName}!${colLetter(col)}${targetRow}:${colLetter(col+3)}${targetRow}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SS_ID,
    range: writeRange,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[subcategory, dateStr, Number(amount), note || '']] }
  });

  return { success: true, row: targetRow, sheet: sheetName };
}

async function updateTransaction(data) {
  const { sheetName, row, startCol, subcategory, date, amount, note } = data;
  if (!sheetName || !row || !startCol) throw new Error('Faltan metadatos.');

  const d    = new Date(date);
  const dd   = String(d.getDate()).padStart(2,'0');
  const mm   = String(d.getMonth()+1).padStart(2,'0');
  const yyyy = d.getFullYear();
  const dateStr = `${mm}/${dd}/${yyyy}`;

  const sheets = await getSheets();
  const range  = `${sheetName}!${colLetter(startCol)}${row}:${colLetter(startCol+3)}${row}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SS_ID,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[subcategory, dateStr, Number(amount), note || '']] }
  });
  return { success: true };
}

async function deleteTransaction(sheetName, row, startCol) {
  const sheets = await getSheets();
  const range  = `${sheetName}!${colLetter(startCol)}${row}:${colLetter(startCol+3)}${row}`;
  await sheets.spreadsheets.values.clear({ spreadsheetId: SS_ID, range });
  return { success: true };
}

// ─── HANDLER PRINCIPAL ───────────────────────────────────────
export default async function handler(req, res) {
  // CORS — permite peticiones desde tu dominio Vercel
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { action } = req.query;

    if (req.method === 'GET') {
      if (action === 'getPin')          return res.json(await getPin());
      if (action === 'getConfig')       return res.json(await getConfig());
      if (action === 'getMonthData')    return res.json(await getMonthData(req.query.month));
      if (action === 'getAnnualSummary')return res.json(await getAnnualSummary());
      return res.status(400).json({ error: 'Acción no reconocida' });
    }

    if (req.method === 'POST') {
      const body = req.body;
      if (action === 'save')   return res.json(await saveTransaction(body));
      if (action === 'update') return res.json(await updateTransaction(body));
      if (action === 'delete') return res.json(await deleteTransaction(body.sheetName, body.row, body.startCol));
      return res.status(400).json({ error: 'Acción no reconocida' });
    }

    res.status(405).json({ error: 'Método no permitido' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
