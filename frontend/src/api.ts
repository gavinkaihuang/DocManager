import axios from 'axios';

const getBaseUrl = () => {
    return localStorage.getItem('backend_url') || 'http://localhost:8000';
}

const api = axios.create({
    baseURL: getBaseUrl(),
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    config.baseURL = getBaseUrl();
    return config;
});

export default api;
