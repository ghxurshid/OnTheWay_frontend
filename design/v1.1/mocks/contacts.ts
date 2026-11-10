/* MOCK DATA SOURCE — contacts (people the user has added). Some carry a
   server-side route (hasRoute) that the route service can fetch on demand. */

export const CONTACTS_DATA = [
  { id: 'ct1', name: 'Aziz Karimov', initials: 'AK', type: 'driver', vehicle: 'Toyota Camry', rating: 4.9,
    phone: '+998 90 123 45 67', online: true, lastSeen: null, latlng: [41.321, 69.246],
    hasRoute: true, fromLatlng: [41.275, 69.204], toLatlng: [41.367, 69.289] },
  { id: 'ct2', name: 'Malika Saidova', initials: 'MS', type: 'passenger', rating: 4.8,
    phone: '+998 91 234 56 78', online: true, lastSeen: null, latlng: [41.272, 69.250],
    hasRoute: true, fromLatlng: [41.230, 69.220], toLatlng: [41.311, 69.279] },
  { id: 'ct3', name: 'Jasur Umarov', initials: 'JU', type: 'driver', vehicle: 'Chevrolet Nexia', rating: 4.7,
    phone: '+998 93 345 67 89', online: false, lastSeen: '12 daqiqa oldin', latlng: [41.325, 69.335],
    hasRoute: false },
  { id: 'ct4', name: 'Dilnoza Nazarova', initials: 'DN', type: 'passenger', rating: 4.9,
    phone: '+998 94 456 78 90', online: true, lastSeen: null, latlng: [41.290, 69.180],
    hasRoute: false },
  { id: 'ct5', name: 'Bobur Toshmatov', initials: 'BT', type: 'driver', vehicle: 'Hyundai Accent', rating: 4.6,
    phone: '+998 97 567 89 01', online: false, lastSeen: '1 soat oldin', latlng: [41.281, 69.276],
    hasRoute: true, fromLatlng: [41.207, 69.333], toLatlng: [41.355, 69.220] },
  { id: 'ct6', name: "Nigora Yo'ldosheva", initials: 'NY', type: 'passenger', rating: 4.9,
    phone: '+998 90 678 90 12', online: true, lastSeen: null, latlng: [41.320, 69.274],
    hasRoute: true, fromLatlng: [41.295, 69.260], toLatlng: [41.345, 69.288] },
  { id: 'ct7', name: 'Sardor Rahimov', initials: 'SR', type: 'driver', vehicle: 'Chevrolet Cobalt', rating: 4.8,
    phone: '+998 99 789 01 23', online: false, lastSeen: 'kecha', latlng: [41.326, 69.235],
    hasRoute: false },
  { id: 'ct8', name: 'Kamola Yusupova', initials: 'KY', type: 'passenger', rating: 4.7,
    phone: '+998 88 890 12 34', online: true, lastSeen: null, latlng: [41.355, 69.220],
    hasRoute: false },
];
