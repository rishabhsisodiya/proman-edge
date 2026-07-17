module.exports = {
  apps: [
    {
      name: 'proman-backend',
      cwd: '/root/proman/backend',
      script: 'doppler',
      args: 'run -- node dist/index.js',
      env: {
        NODE_ENV: 'production',
        DOPPLER_TOKEN: process.env.DOPPLER_TOKEN
      }
    },
    {
      name: 'proman-frontend',
      cwd: '/root/proman/frontend',
      script: 'doppler',
      args: 'run -- npm run start -- -p 3000',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
        DOPPLER_TOKEN: process.env.DOPPLER_TOKEN
      }
    }
  ]
}
