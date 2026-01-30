import axios from 'axios';

const getBaseUrl = () => {
    return (localStorage.getItem('backend_url') || 'http://127.0.0.1:8000').replace(/\/$/, '');
}

const api = axios.create({
    baseURL: getBaseUrl(),
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
        // console.log('Request with token:', config.url);
    } else {
        console.warn('No token found in localStorage');
    }
    config.baseURL = getBaseUrl();
    return config;
});

export default api;
