import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import 'animal-island-ui/style'
import './i18n/index.js'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './auth/AuthContext.jsx'
import { SetupProvider } from './setup/SetupContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <SetupProvider>
          <App />
        </SetupProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
