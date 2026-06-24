import axios from 'axios'

const apiBaseUrl = (
  import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'
).replace(/\/$/, '')

export const apiClient = axios.create({
  baseURL: apiBaseUrl,
  timeout: 120000,
})