module.exports = {
  apps: [
    {
      name: 'proman-backend',
      cwd: '/root/proman/backend',
      script: 'dist/index.js',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'proman-frontend',
      cwd: '/root/proman/frontend',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: '3000'
      }
    }
  ]
}
