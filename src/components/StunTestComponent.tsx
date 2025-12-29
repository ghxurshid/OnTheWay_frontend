import { useState } from 'react';

const StunTestComponent = () => {
    const [publicAddress, setPublicAddress] = useState('Нажмите кнопку "Определить IP..."');
    const [isLoading, setIsLoading] = useState(false);

    const getPublicIpAndPort = async () => {
        // isLoading holatini funksiya boshida rost (true) qilishni unutmang
        setIsLoading(true); 
        console.log("Creating offer to start ICE gathering...");
        setPublicAddress('Определение адреса, пожалуйста, подождите...');

        // ... (Qolgan kod avvalgidek qoladi) ...

        // 1. Конфигурация STUN сервера Google
        const pcConfig = {
            iceServers: [
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };

        // 2. Создаем RTCPeerConnection
        const pc = new RTCPeerConnection(pcConfig);
        console.log("RTCPeerConnection создан:", pc);

        let candidateFound = false;

        // 3. Обработчик событий ICE-кандидатов
        pc.onicecandidate = (event) => {
            if (event.candidate && !candidateFound) {
                const candidateStr = event.candidate.candidate;
                console.log("Found raw ICE candidate:", candidateStr);

                if (candidateStr.includes(' typ srflx')) {
                    const parts = candidateStr.split(' ');
                    const ip = parts[4];
                    const port = parts[5];
                    
                    setPublicAddress(`Ваш публичный IP: ${ip}, Порт: ${port}`);
                    candidateFound = true;
                    setIsLoading(false); // Ish tugagach false qilamiz
                    pc.close(); 
                } 
                // else if ... (qolgan else if shartlari)
            } else if (!event.candidate && !candidateFound) {
                 setPublicAddress('Не удалось определить публичный IP через STUN. Возможно, у вас строгий NAT.');
                 setIsLoading(false); // Ish tugagach false qilamiz
            }
        };
        
        // 4. Создаем предложение (offer) и устанавливаем локальное описание
        try {
            await pc.createOffer();
            await pc.setLocalDescription(pc.localDescription ? pc.localDescription : undefined);
            console.log("Local description set, ICE gathering started.");
        } catch (err) {
            console.log(err);
            setPublicAddress('Ошибка WebRTC при создании Offer.');
            setIsLoading(false); // Xatolik bo'lganda false qilamiz
        }
    };

    return (
        <div>
            <h2>Определение публичного IP через Google STUN</h2>
            {/* CSS klasslarini olib tashladik, oddiy tugma ishlaydi */}
            <button 
                onClick={() => getPublicIpAndPort()} 
                disabled={isLoading} // isLoading holatiga qarab tugmani o'chirib qo'yamiz
                style={{ padding: '10px 20px', cursor: 'pointer' }} // Oddiy uslublar qo'shdik
            >
                {isLoading ? 'Определение...' : 'Определить IP и Порт'}
            </button>
            <p style={{ marginTop: '20px', fontWeight: 'bold' }}>
                {publicAddress}
            </p>
        </div>
    );
};

export default StunTestComponent;
