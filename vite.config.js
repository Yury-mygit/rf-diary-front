const SERVER_URL = process.env.SERVER_URL || 'http://127.0.0.1:8021';

export default {
  base: '/',
  server: {
    host: '0.0.0.0',
    port: 5184,
    strictPort: true,
    allowedHosts: ['diary.dev.raftforge.art'],
    proxy: {
      '/api': { target: SERVER_URL, changeOrigin: true }
    }
  }
};
