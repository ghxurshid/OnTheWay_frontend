export interface ThemeColors {
    bg_color: string;
    section_bg_color: string;
    secondary_bg_color: string;
    text_color: string;
    hint_color: string;
    link_color: string;
    button_color: string;
    button_text_color: string;
    header_bg_color: string;
    accent_text_color: string;
    section_header_text_color: string;
    subtitle_text_color: string;
    destructive_text_color: string;
    section_separator_color: string;
    bottom_bar_bg_color: string;
  }

// export interface Route {
//   originMarker: L.Marker | null;    
//   destinationMarker: L.Marker | null;
// }

export interface TelegramUser {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    allows_write_to_pm?: boolean;
    photo_url?: string;
  }
  
export interface TelegramInitData {
    user?: TelegramUser;
    chat_instance: string;
    chat_type?: "sender" | "private" | "group" | "supergroup" | "channel";
    auth_date: string; // unix timestamp STRING bo‘lib keladi
    signature: string;
    hash: string;
  }
  
export interface TrafficParticipant {
    initData: TelegramInitData;
    circle: L.Circle | null;
    location: L.Marker | null;
    route: L.Layer.Route;
  }

export class Walker extends TrafficParticipant {
    locationIcon: L.DivIcon;
  }

export class Driver extends TrafficParticipant {
    speed: number; // km/h
    heading: number | null; // daraja
}
  
