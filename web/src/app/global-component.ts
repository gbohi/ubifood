import { environment } from 'src/environments/environment';
export const GlobalComponent = {
    // Api Calling
    //API_URL: 'https://api-node.themesbrand.website/',
    API_URL: `${environment.apiUrl}/api/api/`,
    // API_URL : 'http://127.0.0.1:3000/',
    headerToken: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },

    // Auth Api
    AUTH_API: `${environment.apiUrl}/api/api/`,
    // AUTH_API:"http://127.0.0.1:3000/auth/",
    //AUTH_API: `${environment.apiUrl}/api/api/token/`,


    // Products Api
    product: 'apps/product',
    productDelete: 'apps/product/',

    // Orders Api
    order: 'apps/order',
    orderId: 'apps/order/',

    // Customers Api
    customer: 'apps/customer',
}