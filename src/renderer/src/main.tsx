import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/manrope'
import App from './App'
import './styles.css'
import './theme-polish.css'

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
