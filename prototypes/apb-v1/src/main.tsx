import React from 'react'
import ReactDOM from 'react-dom/client'
// Cormorant Garamond 500 + 600 (titles); unicode-range means EN/FR pages fetch latin (+ latin-ext when needed) only.
import '@fontsource/cormorant-garamond/500.css'
import '@fontsource/cormorant-garamond/600.css'
import '@fontsource/source-sans-3/400.css'
import '@fontsource/source-sans-3/600.css'
import './index.css'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
