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
      args: 'run start -- -p 3000',
      env: {
        NODE_ENV: 'production',
        PORT: '3000'
      }
    }
  ]
}
