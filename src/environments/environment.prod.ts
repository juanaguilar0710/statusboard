export const environment = {
  version: "1.4.0.62",
  production: false,
  resetPin: '1111',
  maxInactivityTime: 20,
  timeSaveScreen: 3,
 
  currentPage: 0,
  roomsPerPage: 3,
  timeRoomsPerPage: 10000,
  
  currentPageWhitPatients: 0,
  roomsPerPageWhitPatients: 8,
  pageSizeWhitPatients: 5,
  timeForCardsWhitPatients: 10000,//adentro de las cards
  timeRoomsPerPageWhitPatients: 60000,//pagina completa

  broadcasting: {
    driver: 'pusher', // 'socket.io',
    host: 'https://api.dtouchmedia.com'
  },

  pusher: {
    key: '7c4e353eb51fce335b63', //prod    
    //key: '2889bc5e0828ce2dabb2', //dev 
    cluster: 'us2',
    forceTLS: true
  },

  timeList: [
    {
      value: "00:30:00",
      display: "12:30 AM"
    },
    {
      value: "01:00:00",
      display: "01:00 AM"
    },
    {
      value: "01:30:00",
      display: "01:30 AM"
    },
    {
      value: "02:00:00",
      display: "02:00 AM"
    },
    {
      value: "02:30:00",
      display: "02:30 AM"
    },
    {
      value: "03:00:00",
      display: "03:00 AM"
    },
    {
      value: "03:30:00",
      display: "03:30 AM"
    },
    {
      value: "04:00:00",
      display: "04:00 AM"
    },
    {
      value: "04:30:00",
      display: "04:30 AM"
    },
    {
      value: "05:00:00",
      display: "05:00 AM"
    },
    {
      value: "05:30:00",
      display: "05:30 AM"
    },
    {
      value: "06:00:00",
      display: "06:00 AM"
    },
    {
      value: "06:30:00",
      display: "06:30 AM"
    },
    {
      value: "07:00:00",
      display: "07:00 AM"
    },
    {
      value: "07:30:00",
      display: "07:30 AM"
    },
    {
      value: "08:00:00",
      display: "08:00 AM"
    },
    {
      value: "08:30:00",
      display: "08:30 AM"
    },
    {
      value: "09:00:00",
      display: "09:00 AM"
    },
    {
      value: "09:30:00",
      display: "09:30 AM"
    },
    {
      value: "10:00:00",
      display: "10:00 AM"
    },
    {
      value: "10:30:00",
      display: "10:30 AM"
    },
    {
      value: "11:00:00",
      display: "11:00 AM"
    },
    {
      value: "11:30:00",
      display: "11:30 AM"
    },
    {
      value: "12:00:00",
      display: "12:00 PM"
    },
    {
      value: "12:30:00",
      display: "12:30 PM"
    },
    {
      value: "13:00:00",
      display: "01:00 PM"
    },
    {
      value: "13:30:00",
      display: "01:30 PM"
    },
    {
      value: "14:00:00",
      display: "02:00 PM"
    },
    {
      value: "14:30:00",
      display: "02:30 PM"
    },
    {
      value: "15:00:00",
      display: "03:00 PM"
    },
    {
      value: "15:30:00",
      display: "03:30 PM"
    },
    {
      value: "16:00:00",
      display: "04:00 PM"
    },
    {
      value: "16:30:00",
      display: "04:30 PM"
    },
    {
      value: "17:00:00",
      display: "05:00 PM"
    },
    {
      value: "17:30:00",
      display: "05:30 PM"
    },
    {
      value: "18:00:00",
      display: "06:00 PM"
    },
    {
      value: "18:30:00",
      display: "06:30 PM"
    },
    {
      value: "19:00:00",
      display: "07:00 PM"
    },
    {
      value: "19:30:00",
      display: "07:30 PM"
    },
    {
      value: "20:00:00",
      display: "08:00 PM"
    },
    {
      value: "20:30:00",
      display: "08:30 PM"
    },
    {
      value: "21:00",
      display: "09:00 PM"
    },
    {
      value: "21:30:00",
      display: "09:30 PM"
    },
    {
      value: "22:00:00",
      display: "10:00 PM"
    },
    {
      value: "22:30:00",
      display: "10:30 PM"
    },
    {
      value: "23:00:00",
      display: "11:00 PM"
    },
    {
      value: "23:30:00",
      display: "11:30 PM"
    },
    {
      value: "24:00:00",
      display: "12:00 AM"
    },
  ],

  
  url: 'https://api.dtouchmedia.com',
  //url: 'https://api.dtouchmedia.dev',
  auth: '/auth',
  login: '/login',
  refresh: '/refresh',
  pin: '/pin',
  api: '/api',
  public: '/public',
  branchesrooms: '/branches-rooms',
  visitor: '/visitor',
  status: '/status',
  comments: '/comments',
  waitingRooms: '/waitingRooms',
  surgeons: '/surgeons',
  operatingrooms: '/operating-rooms',
  procedures: '/procedures',
  branch: '/branch',
  recoveryrooms: '/recovery-rooms',
  operatingroomsschedules: '/operating-rooms-schedules',
  operatingroomusers: '/operating-room-users',
  patients: '/patients',
  waiting_room_id: 'waiting_room_id'
};
