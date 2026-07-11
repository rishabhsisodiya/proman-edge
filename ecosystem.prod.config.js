module.exports = {
  apps: [
    {
      name: 'proman-prod-backend',
      cwd: '/root/proman-prod/backend',
      script: 'doppler',
      args: 'run -- node dist/index.js',
      env: {
        NODE_ENV: 'production',
        PORT: '4001',
        DOPPLER_TOKEN: process.env.DOPPLER_TOKEN
      }
    },
    {
      name: 'proman-prod-frontend',
      cwd: '/root/proman-prod/frontend',
      script: 'doppler',
      args: 'run -- npm run start -- -p 3001',
      env: {
        NODE_ENV: 'production',
        PORT: '3001',
        DOPPLER_TOKEN: process.env.DOPPLER_TOKEN
      }
    }
  ]
}
