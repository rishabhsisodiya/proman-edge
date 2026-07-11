module.exports = {
  apps: [
    {
      name: 'proman-prod-backend',
      cwd: '/Users/rishabhsisodiya/PROMAN-prod/backend',
      script: 'dist/index.js',
      env: {
        NODE_ENV: 'production',
        PORT: '4001'
      }
    },
    {
      name: 'proman-prod-frontend',
      cwd: '/Users/rishabhsisodiya/PROMAN-prod/frontend',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: '3001'
      }
    }
  ]
}
