/* MOCK DATA SOURCE — completed trip history. */

import { NOW } from '@/utils/datetime';

export const HISTORY_DATA = [
  { id: 'h1', from: 'Chilonzor, 9-mavze', to: 'Yunusabad metro', date: new Date(NOW - 86400000), duration: '24 min', km: '7.2', role: 'passenger', partner: 'Aziz K.', rating: 5, status: 'completed' },
  { id: 'h2', from: 'Sergeli, 30-mavze', to: 'Amir Temur xiyoboni', date: new Date(NOW - 2 * 86400000), duration: '38 min', km: '12.4', role: 'driver', partner: 'Malika S.', rating: 4, status: 'completed' },
  { id: 'h3', from: 'Mirzo Ulugbek', to: 'Toshkent TDTU', date: new Date(NOW - 5 * 86400000), duration: '18 min', km: '5.1', role: 'passenger', partner: 'Jasur U.', rating: 5, status: 'completed' },
  { id: 'h4', from: 'Uchtepa tumani', to: 'Hamza bozori', date: new Date(NOW - 7 * 86400000), duration: '31 min', km: '9.8', role: 'passenger', partner: 'Bobur T.', rating: 4, status: 'completed' },
  { id: 'h5', from: 'Bektemir', to: 'Olmazor', date: new Date(NOW - 10 * 86400000), duration: '42 min', km: '14.2', role: 'driver', partner: 'Dilnoza N.', rating: 5, status: 'completed' },
];
