# Mis Gastos — PWA

App web progresiva para control de gastos personales, conectada a Google Sheets.

## Stack
- **Frontend:** HTML/CSS/JS estático en `/public`
- **Backend:** Vercel Serverless Function en `/api/sheets.js`
- **Base de datos:** Google Sheets via API v4
- **Auth:** Google Service Account (credenciales en variable de entorno)

---

## Instalación paso a paso

### 1. Crear Service Account en Google Cloud

1. Ir a [console.cloud.google.com](https://console.cloud.google.com)
2. Crear proyecto nuevo (o usar uno existente)
3. Activar la **Google Sheets API**:
   - Menú → APIs y servicios → Biblioteca → buscar "Google Sheets API" → Activar
4. Crear credenciales:
   - APIs y servicios → Credenciales → Crear credenciales → **Cuenta de servicio**
   - Nombre: `mis-gastos-app` → Crear
   - Rol: ninguno necesario → Continuar → Listo
5. Abrir la cuenta de servicio creada → pestaña **Claves** → Agregar clave → JSON
6. Se descargará un archivo `.json` — **guárdalo, lo necesitarás**

### 2. Compartir tu Google Sheet con la Service Account

1. Abre el archivo `.json` descargado y copia el valor de `"client_email"`
   (tiene formato `nombre@proyecto.iam.gserviceaccount.com`)
2. Abre tu Google Sheet
3. Botón **Compartir** → pega el email → rol: **Editor** → Enviar

### 3. Subir el código a GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/mis-gastos.git
git push -u origin main
```

### 4. Desplegar en Vercel

1. Ir a [vercel.com](https://vercel.com) → **Add New Project**
2. Importar el repositorio de GitHub
3. Vercel detecta automáticamente la configuración
4. Antes de desplegar, agregar la variable de entorno:
   - Nombre: `GOOGLE_SERVICE_ACCOUNT_KEY`
   - Valor: el contenido **completo** del archivo `.json` de la Service Account
     (copia y pega todo el JSON como una sola línea)
5. Clic en **Deploy**

### 5. Instalar como WebAPK en Android (Chrome)

1. Abre la URL de tu app en Chrome para Android
2. Espera a que cargue completamente
3. Chrome mostrará automáticamente el banner **"Agregar a pantalla de inicio"**
   - Si no aparece: menú (⋮) → "Agregar a pantalla de inicio"
4. La app se instala como WebAPK nativo — aparece en el cajón de apps

### 6. Instalar en iPhone (Safari)

1. Abre la URL en Safari
2. Botón compartir (cuadrado con flecha) → "Agregar a pantalla de inicio"
3. Se instala como PWA standalone

---

## Variables de entorno requeridas

| Variable | Descripción |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_KEY` | JSON completo de la Service Account |

---

## Estructura del proyecto

```
mis-gastos/
├── api/
│   └── sheets.js          # Serverless function (reemplaza Code.gs)
├── public/
│   ├── index.html         # App completa
│   ├── manifest.json      # PWA manifest
│   ├── sw.js              # Service Worker
│   └── icons/
│       ├── icon-192.svg
│       └── icon-512.svg
├── .gitignore
├── package.json
├── vercel.json
└── README.md
```

---

## Actualizar la app

Cualquier `git push` a `main` redespliega automáticamente en Vercel.
