module.exports = {
    apps: [{
        name: 't-training-api',
        cwd: '/home/ubuntu/t-training/app',
        script: 'server/tencent-api.mjs',
        interpreter: 'node',
        node_args: '--env-file=/home/ubuntu/.config/t-training.env',
        instances: 1,
        exec_mode: 'fork',
        autorestart: true,
        max_memory_restart: '512M',
        min_uptime: '10s',
        max_restarts: 10,
        restart_delay: 1000,
        kill_timeout: 15000,
        merge_logs: true,
        time: true,
        env: {
            NODE_ENV: 'production',
            HOST: '127.0.0.1',
            PORT: '3001',
            PUBLIC_ORIGIN: 'https://ai.teachailab.com',
            T_TRAINING_AUTOSTART: '1'
        }
    }]
};
