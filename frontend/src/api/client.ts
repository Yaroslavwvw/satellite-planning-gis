// import axios from 'axios'

// export const apiClient = axios.create({
//   baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000',
//   timeout: 10000,
// })

import axios from 'axios'

export const apiClient = axios.create({
  baseURL:
    import.meta.env.VITE_API_BASE_URL ??
    'http://127.0.0.1:8000',
})