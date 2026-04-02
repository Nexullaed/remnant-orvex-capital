import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000",
  withCredentials: true,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.message || error.response?.data?.error || error.message || "Request failed";
    const normalized = new Error(message);
    normalized.status = error.response?.status || 500;
    normalized.payload = error.response?.data || null;
    return Promise.reject(normalized);
  }
);

export default api;
