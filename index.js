const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static('./www'));
app.use(express.json());

const PORT = process.env.PORT || 8080;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});

class Taixiu {
    constructor() {
        this.idPhien = 0;
        this.timeDatCuoc = 50;
        this.timeLacXiNgau = 5;
        this.timechophienmoi = 10;
        this.soNguoiChonTai = 0;
        this.soNguoiChonXiu = 0;
        this.tongTienDatTai = 0;
        this.tongTienDatXiu = 0;
        this.virtualTaiMoney = 0;
        this.virtualXiuMoney = 0;
        this.time = this.timeDatCuoc;
        this.coTheDatCuoc = true;
        this.idChonTai = [];
        this.idChonXiu = [];
        this.ketQua = '';
        this.adminResult = null;
        this.history = [];
    }

    gameStart() {
        this.idPhien++;
        this.coTheDatCuoc = false;
        this.time = this.timeLacXiNgau;
        this.adminResult = null;
        io.sockets.emit('gameLacXiNgau', { time: this.time });

        const interval = setInterval(() => {
            this.time--;
            // Gửi dữ liệu xúc xắc nhảy trong 5 giây
            const tempDice = this.gameRandomResult();
            io.sockets.emit('gameData', { 
                idGame: this.idPhien, 
                time: this.time, 
                phase: 'lac',
                tempDice: tempDice 
            });
            if (this.time <= 0) {
                clearInterval(interval);
                this.startBetting();
            }
        }, 1000);
    }

    startBetting() {
        this.coTheDatCuoc = true;
        this.soNguoiChonTai = this.soNguoiChonXiu = 0;
        this.tongTienDatTai = this.tongTienDatXiu = 0;
        this.virtualTaiMoney = this.virtualXiuMoney = 0;
        this.idChonTai = [];
        this.idChonXiu = [];
        this.time = this.timeDatCuoc;
        io.sockets.emit('gameStart', this.ketQua);

        const interval = setInterval(() => {
            this.time--;
            if (this.coTheDatCuoc && this.time > 5) {
                this.virtualTaiMoney += Math.floor(Math.random() * 5000000);
                this.virtualXiuMoney += Math.floor(Math.random() * 5000000);
                if (this.virtualTaiMoney > 1e9) this.virtualTaiMoney = 1e9;
                if (this.virtualXiuMoney > 1e9) this.virtualXiuMoney = 1e9;
            }
            io.sockets.emit('gameData', {
                idGame: this.idPhien,
                soNguoiChonTai: this.soNguoiChonTai,
                soNguoiChonXiu: this.soNguoiChonXiu,
                tongTienDatTai: this.tongTienDatTai + this.virtualTaiMoney,
                tongTienDatXiu: this.tongTienDatXiu + this.virtualXiuMoney,
                time: this.time,
                phase: 'betting',
                adminResult: this.adminResult
            });
            if (this.time <= 0) {
                clearInterval(interval);
                this.gameOver();
            }
        }, 1000);
    }

    gameOver() {
        this.coTheDatCuoc = false;
        this.time = this.timechophienmoi;
        this.ketQua = this.adminResult || this.gameRandomResult();
        
        // Ensure ketQua is structured properly for the roadmap
        const historyEntry = { 
            phien: this.idPhien, 
            ketQua: this.ketQua 
        };
        this.history.unshift(historyEntry);
        if (this.history.length > 20) this.history.pop();

        io.sockets.emit('gameOver', this.ketQua);
        io.sockets.emit('historyUpdate', this.history);
        this.idChonTai = [];
        this.idChonXiu = [];

        const interval = setInterval(() => {
            this.time--;
            io.sockets.emit('gameData', {
                idGame: this.idPhien,
                time: this.time,
                phase: 'result',
                ketQua: this.ketQua
            });
            if (this.time <= 0) {
                clearInterval(interval);
                this.gameStart();
            }
        }, 1000);
    }

    gameRandomResult() {
        const d1 = Math.floor(Math.random() * 6) + 1;
        const d2 = Math.floor(Math.random() * 6) + 1;
        const d3 = Math.floor(Math.random() * 6) + 1;
        const sum = d1 + d2 + d3;
        const res = sum <= 10 ? 'xiu' : 'tai';
        return { dice1: d1, dice2: d2, dice3: d3, result: res, sum: sum };
    }

    setAdminResult(res) {
        if (!this.coTheDatCuoc) return { status: 'error', error: 'Đã hết thời gian đặt cược' };
        let d1, d2, d3, sum;
        let attempts = 0;
        do {
            d1 = Math.floor(Math.random() * 6) + 1;
            d2 = Math.floor(Math.random() * 6) + 1;
            d3 = Math.floor(Math.random() * 6) + 1;
            sum = d1 + d2 + d3;
            attempts++;
            if (attempts > 100) break; // Safety
        } while ((res === 'tai' && sum <= 10) || (res === 'xiu' && sum > 10));
        
        this.adminResult = { dice1: d1, dice2: d2, dice3: d3, result: res, sum: sum };
        return { status: 'success', result: this.adminResult };
    }

    setAdminDice(d1, d2, d3) {
        if (!this.coTheDatCuoc) return { status: 'error', error: 'Đã hết thời gian đặt cược' };
        const sum = d1 + d2 + d3;
        const res = sum <= 10 ? 'xiu' : 'tai';
        this.adminResult = { dice1: d1, dice2: d2, dice3: d3, result: res };
        return { status: 'success', result: this.adminResult };
    }

    putMoney(id, dice, money) {
        if (!this.coTheDatCuoc) return { status: 'error', error: 'Không thể đặt cược lúc này' };
        if (money <= 0) return { status: 'error', error: 'Số tiền không hợp lệ' };
        
        if (dice === 'tai') {
            this.idChonTai.push({ id, money });
            this.soNguoiChonTai++;
            this.tongTienDatTai += money;
        } else {
            this.idChonXiu.push({ id, money });
            this.soNguoiChonXiu++;
            this.tongTienDatXiu += money;
        }
        return { status: 'success' };
    }

    getStatus() {
        return {
            idPhien: this.idPhien,
            time: this.time,
            coTheDatCuoc: this.coTheDatCuoc,
            soNguoiChonTai: this.soNguoiChonTai,
            soNguoiChonXiu: this.soNguoiChonXiu,
            tongTienDatTai: this.tongTienDatTai + this.virtualTaiMoney,
            tongTienDatXiu: this.tongTienDatXiu + this.virtualXiuMoney,
            adminResult: this.adminResult,
            history: this.history
        };
    }
}

const tx = new Taixiu();

io.on('connection', (socket) => {
    socket.emit('historyUpdate', tx.history);
    
    socket.on('pull', (data) => {
        const msg = tx.putMoney(socket.id, data.dice, data.money);
        socket.emit('pull', msg);
    });
    
    socket.on('adminSetResult', (data) => {
        if (data.password === 'admin123') {
            const result = tx.setAdminResult(data.result);
            socket.emit('adminResponse', result);
        } else {
            socket.emit('adminResponse', { status: 'error', error: 'Sai mật khẩu' });
        }
    });
    
    socket.on('adminSetDice', (data) => {
        if (data.password === 'admin123') {
            const result = tx.setAdminDice(data.dice1, data.dice2, data.dice3);
            socket.emit('adminResponse', result);
        } else {
            socket.emit('adminResponse', { status: 'error', error: 'Sai mật khẩu' });
        }
    });
    
    socket.on('adminGetStatus', (data) => {
        if (data.password === 'admin123') {
            socket.emit('adminStatus', tx.getStatus());
        }
    });
});

tx.gameStart();

// Keep process alive and auto-restart if needed
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});