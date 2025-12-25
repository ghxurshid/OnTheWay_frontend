interface TelegramWebApp {
    ready(): void;
    close(): void;
    expand(): void;
    initData: string;
    initDataUnsafe: any;
    showAlert(message: string): void;
    showConfirm(message: string, cb: (ok: boolean) => void): void;
  }
  
  interface Telegram {
    WebApp: TelegramWebApp;
  }
  
  interface Window {
    Telegram: Telegram;
  }
  
