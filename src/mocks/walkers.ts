/* MOCK DATA SOURCE — scheduled walkers (drivers/passengers) around Tashkent.
   Consumed only by the API layer (api/walkerApi.js), never by UI directly. */

import { dt } from '@/utils/datetime';

export const WALKERS_DATA = [
  { id: 'w1', type: 'driver', initials: 'AK', name: 'Aziz Karimov', from: 'Chilonzor, 9-mavze', to: 'Yunusabad, 7-mavze', fromLatlng: [41.275, 69.204], toLatlng: [41.367, 69.289], when: dt(8, 30), seats: 3, rating: 4.9, vehicle: 'Toyota Camry' },
  { id: 'w2', type: 'passenger', initials: 'MS', name: 'Malika Saidova', from: 'Sergeli bozori', to: "Amir Temur ko'chasi", fromLatlng: [41.230, 69.220], toLatlng: [41.311, 69.279], when: dt(8, 45), seats: 1, rating: 4.8, vehicle: null },
  { id: 'w3', type: 'driver', initials: 'JU', name: 'Jasur Umarov', from: 'Mirzo Ulugbek metro', to: 'Toshkent shahri', fromLatlng: [41.325, 69.335], toLatlng: [41.311, 69.280], when: dt(9, 0), seats: 4, rating: 4.7, vehicle: 'Chevrolet Nexia' },
  { id: 'w4', type: 'passenger', initials: 'DN', name: 'Dilnoza Nazarova', from: 'Uchtepa', to: 'Hamza bozori', fromLatlng: [41.290, 69.180], toLatlng: [41.300, 69.330], when: dt(9, 10), seats: 1, rating: 4.9, vehicle: null },
  { id: 'w5', type: 'driver', initials: 'BT', name: 'Bobur Toshmatov', from: 'Bektemir', to: 'Olmazor tumani', fromLatlng: [41.207, 69.333], toLatlng: [41.355, 69.220], when: dt(9, 20), seats: 2, rating: 4.6, vehicle: 'Hyundai Accent' },
  { id: 'w6', type: 'passenger', initials: 'NY', name: "Nigora Yo'ldosheva", from: 'Yakkasaroy', to: 'Bodomzor', fromLatlng: [41.295, 69.260], toLatlng: [41.345, 69.288], when: dt(8, 15), seats: 1, rating: 4.9, vehicle: null },
  { id: 'w7', type: 'driver', initials: 'SR', name: 'Sardor Rahimov', from: 'Chorsu', to: 'Mirobod', fromLatlng: [41.326, 69.235], toLatlng: [41.295, 69.295], when: dt(8, 50), seats: 3, rating: 4.8, vehicle: 'Chevrolet Cobalt' },
  { id: 'w8', type: 'passenger', initials: 'KY', name: 'Kamola Yusupova', from: 'Olmazor', to: "Amir Temur ko'chasi", fromLatlng: [41.355, 69.220], toLatlng: [41.311, 69.279], when: dt(9, 5), seats: 1, rating: 4.7, vehicle: null },
  { id: 'w9', type: 'driver', initials: 'ON', name: 'Otabek Nazarov', from: 'Yunusabad', to: 'Sergeli', fromLatlng: [41.367, 69.289], toLatlng: [41.230, 69.220], when: dt(9, 30), seats: 4, rating: 4.5, vehicle: 'Chevrolet Malibu' },
  { id: 'w10', type: 'passenger', initials: 'FE', name: 'Feruza Ergasheva', from: 'Mirobod', to: 'Mirzo Ulugbek', fromLatlng: [41.295, 69.295], toLatlng: [41.325, 69.335], when: dt(8, 40), seats: 1, rating: 4.9, vehicle: null },
  { id: 'w11', type: 'driver', initials: 'SA', name: 'Sherzod Aliyev', from: 'Bodomzor', to: 'Chilonzor', fromLatlng: [41.345, 69.288], toLatlng: [41.275, 69.204], when: dt(9, 15), seats: 2, rating: 4.6, vehicle: 'Chevrolet Lacetti' },
  { id: 'w12', type: 'passenger', initials: 'MK', name: 'Madina Karimova', from: 'Yashnobod', to: 'Chorsu', fromLatlng: [41.290, 69.310], toLatlng: [41.326, 69.235], when: dt(9, 25), seats: 1, rating: 4.8, vehicle: null },
];
