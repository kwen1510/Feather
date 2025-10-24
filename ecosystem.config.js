module.exports = {
  apps: [{
    name: 'whiteboard-api',
    script: './server.js',
    instances: 1,
    exec_mode: 'fork',

    // Environment variables
    env: {
      NODE_ENV: 'production',
      PORT: 8080
    },

    // Auto-restart configuration
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',

    // Logging
    error_file: '/var/log/pm2/whiteboard-error.log',
    out_file: '/var/log/pm2/whiteboard-out.log',
    log_file: '/var/log/pm2/whiteboard-combined.log',
    time: true,

    // Restart delay
    restart_delay: 4000,

    // Max restarts within min_uptime
    min_uptime: '10s',
    max_restarts: 10,

    // Graceful shutdown
    kill_timeout: 5000,

    // Source map support for better error traces
    source_map_support: true,

    // Instance variables
    instance_var: 'INSTANCE_ID',

    // Merge logs from different instances
    merge_logs: true,

    // Environment-specific settings
    env_production: {
      NODE_ENV: 'production',
      PORT: 8080
    },

    env_development: {
      NODE_ENV: 'development',
      PORT: 8080
    }
  }]
};
