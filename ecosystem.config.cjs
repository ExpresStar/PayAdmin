module.exports = {
  apps: [
    {
      name: "PayAdmin-Bot",
      script: "./bot.js",
      cwd: "./",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
      // Auto restart jika crash
      autorestart: true,
      max_memory_restart: "500M",
      
      // Logging
      output: "./logs/bot-out.log",
      error: "./logs/bot-err.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      
      // Graceful shutdown
      kill_timeout: 10000,
      
      // Monitoring
      watch: false,
      ignore_watch: ["node_modules", "logs", "bot_states.json"],
    },
  ],
};
