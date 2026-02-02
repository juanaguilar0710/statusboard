# Status Board - AI Coding Agent Instructions

## Project Overview
Status Board is an **Ionic 7 + Angular 16 + Capacitor 5** hybrid mobile app for surgical/hospital patient status tracking. Built with TypeScript, deployed to iOS/Android, featuring real-time updates via Pusher/Laravel Echo.

## Architecture & Key Patterns

### Technology Stack
- **Frontend**: Angular 16, Ionic 7, TypeScript
- **Mobile Runtime**: Capacitor 5 (iOS 5.4.2, Android 5.4.2)
- **Real-time**: Pusher-js 8.x + Laravel Echo 1.15.x
- **State Management**: Capacitor Preferences API (replaces Ionic Storage for user/config)
- **Audio**: Howler.js, Text-to-Speech, Tone.js for notifications
- **UI**: Bootstrap 5.3, Ionic components, HammerJS gestures

### Project Structure
```
src/app/
├── api/                    # HTTP services + LocaldataService
│   ├── requests.service.ts # Main API client (JWT bearer tokens)
│   ├── localdata.service.ts # Capacitor Preferences wrapper
│   ├── chat.service.ts     
│   ├── logger.service.ts   # Ionic Storage logs (errors only)
│   └── network.service.ts  
├── services/               # Domain services
│   └── audio.service.ts    
├── interceptor/            
│   └── logging.interceptor.ts # Auto-injects Bearer token, logs HTTP
├── models/                 # Data models (e.g., PatientModel)
├── dashboard/              # Main patient tracking view (~1600 LOC)
├── patient-chat/           # Real-time chat module
└── [feature modules]/      # Lazy-loaded (pin, login, home, etc.)
```

### Critical Services

#### LocaldataService (Capacitor Preferences)
- **Purpose**: Persistent key-value storage for user sessions, config, operating rooms, daily patient cache
- **Key Pattern**: Keys prefixed with `{username}_` for multi-user support
- **Daily Patient Cache**: `{username}_patients_{YYYY-M-D}` - auto-clears previous days
- Uses `@capacitor/preferences` API (native storage)

#### RequestsService (API Client)
- **Base URL**: `environment.url` (prod: `https://api.dtouchmedia.cloud`)
- **Auth**: OAuth2 password grant → JWT bearer token (stored in LoggerService)
- **Token Management**: Checks expiration via `isTokenExpired()`, auto-refresh
- **PIN Auth**: Secondary auth flow for device-level login (`environment.auth/pin`)
- **Config**: Requires `config` object with `branch.id` and `waitingRoom.id` for most endpoints

#### LoggingInterceptor
- **Auto-injects** `Authorization: Bearer {token}` on all HTTP requests
- Logs request/response to LoggerService (errors only saved to Ionic Storage)
- Sanitizes sensitive headers/data before logging

### Real-time Communication (Pusher/Laravel Echo)
**Pattern**: Multi-component Echo instances (Dashboard, PatientChat, Home)

```typescript
// Standard setup in ngOnInit
(<any>window).Pusher = Pusher;
this.laravelEcho = new Echo({
  broadcaster: 'pusher',
  key: environment.pusher.key,      // 'e72d8c13b0aa1e06c27d'
  cluster: environment.pusher.cluster, // 'us2'
  forceTLS: environment.pusher.forceTLS,
  authEndpoint: environment.broadcasting.host + '/broadcasting/auth',
  auth: {
    headers: {
      'Authorization': `Bearer ${this.token}`,
      'Accept': 'application/json'
    }
  },
  authorizer: (channel, options) => { /* custom auth via RequestsService */ }
});

// Private channel subscription
this.laravelEcho.private(`chat.${chatRoomId}`)
  .listen('.MessageSent', (data) => { /* handle event */ });
```
**Critical**: Always disconnect Echo in `ngOnDestroy()` to prevent memory leaks

### Environment Configuration
**Two environments**: `environment.ts` (dev) vs `environment.prod.ts` (prod)
- **API URL**: Toggle between dev/prod backends
- **Pusher Keys**: Separate keys per environment
- **Pagination/Timing**: All UI refresh intervals centralized here
  - `timeRoomsPerPage: 10000` (room rotation)
  - `maxInactivityTime: 60` (auto-logout)
- **OAuth Credentials**: `oauthObj.clientId/clientSecret` differs per env
- **API Path Constants**: All endpoint paths (`/visitor`, `/status`, etc.)

## Development Workflows

### Build & Run Commands
```bash
# Web dev server (Angular)
npm start  # or: ng serve

# Build for web
npm run build  # outputs to www/

# Build + Sync to native platforms
ionic cap build  # builds Angular + syncs to android/ios

# Sync Capacitor without building
npx ionic cap sync

# Open native IDEs
npx cap open android
npx cap open ios

# Testing
npm test  # Karma + Jasmine
```

### Node Version Requirement
**Node 18** required (see terminal history: `nvm use 18`)

### Build Configuration
- **Output**: `www/` (Angular build, consumed by Capacitor)
- **Budget Limits**: 2MB warning, 5MB error (see [angular.json](angular.json))
- **Bootstrap + Popper**: Bundled in scripts/styles arrays
- **Ionicons SVG**: Copied to `www/svg/` via assets config
- **SASS Config**: Custom `sass.config.js` for theming

### AppCenter Pre-build Hook
[android/appcenter-pre-build.sh](android/appcenter-pre-build.sh) runs `npm i && ionic cap sync` on non-main branches

## Project-Specific Conventions

### Gesture Handling (HammerJS)
**Custom config** in [ionicGestureConfig.ts](src/app/ionicGestureConfig.ts) required for Ionic + HammerJS compatibility. Registered in [app.module.ts](src/app/app.module.ts):
```typescript
{ provide: HAMMER_GESTURE_CONFIG, useClass: IonicGestureConfig }
```

### Inactivity Auto-Logout
[app.component.ts](src/app/app.component.ts) uses `@HostListener` on `document:mousemove/click/touchstart/keydown` to reset timer. After `environment.maxInactivityTime` (60 sec), redirects to PIN screen.

### Audio Notifications
- **AudioService**: Manages Howler.js for custom sounds
- **TextToSpeech Plugin**: `@capacitor-community/text-to-speech` for voice alerts
- **Pattern**: Dashboard plays audio + TTS on patient status changes via Pusher events

### Lazy Loading
All feature modules use Angular's `loadChildren` syntax. No eager-loaded routes except redirect to `/pin`.

### Network Status Handling
[NetworkService](src/app/api/network.service.ts) + `@capacitor/network` plugin:
- Dashboard sets `deviceWasOffline` flag → triggers full data refresh on reconnect
- Check `networkStatus` property before API calls in data-heavy components

### Patient Data Caching
- **LocaldataService.setPatients()**: Cache daily patient list to reduce API calls
- **Cleanup**: Auto-removes previous days' caches via `deletePreviousPatients()`
- **Format**: `{username}_patients_YYYY-M-D` keys

## Integration Points

### Backend API
**Base**: `https://api.dtouchmedia.cloud` (prod)
- **Auth**: OAuth2 (`/oauth/token`) + JWT bearer
- **Main Resources**: `/visitor` (patients), `/status`, `/operating-rooms`, `/chat`
- **Broadcasting Auth**: `/broadcasting/auth` for Pusher private channels

### Capacitor Plugins
- **Preferences**: User/config persistence
- **Network**: Connectivity monitoring
- **Toast, Dialog, Haptics**: Native UI feedback
- **Live Updates** (`@capacitor/live-updates`): OTA updates (appId: `042a1261`)
- **Status Bar, Keyboard**: Platform-specific controls
- **Insomnia** (Cordova plugin): Keep screen awake in dashboard view

### Styling
- **Global**: [src/global.scss](src/global.scss), [styles.scss](styles.scss)
- **Theme**: [src/theme/variables.scss](src/theme/variables.scss)
- **Bootstrap**: Imported globally, used alongside Ionic components

## Domain Model Architecture

### Hospital Entity Hierarchy
La aplicación maneja una jerarquía de 4 niveles que define el contexto operativo:

```
Branch (Sucursal/Hospital)
  └── Waiting Room (Sala de Espera)
      └── Operating Rooms (Quirófanos - múltiples)
          └── Patients (Pacientes asignados)
```

### Objeto `config` (Contexto Central)
**Almacenado en**: `Preferences` key `'config'` + `RequestsService.config`  
**Estructura crítica**:
```typescript
{
  branch: {
    id: number,
    name: string,
    image_url: string
  },
  waitingRoom: {
    id: number,
    name: string,
    branch_Id: number  // FK a branch
  },
  stationName: string,        // Nombre del dispositivo/tablet
  aplication: "1" | "2" | "3", // 1=Tablet, 2=Dashboard Cards, 3=Dashboard List
  token: string                // Token de sesión actual
}
```

### Flujo de Configuración Inicial
1. **Login Admin** → Obtiene lista de branches disponibles
2. **Pantalla Configuration** → Usuario selecciona `branch` + `waitingRoom`
3. **Guardado en Preferences** → Keys: `'config'`, `'branch'`, `'waiting_rooms'`, `'operatingRooms'`
4. **Inicio con PIN** → Valida config existente y redirige según `aplication` type

### Dependencias de Datos por Nivel

**Nivel Branch** (`config.branch.id` requerido):
- `/branch/{id}/recovery-rooms` - Salas de recuperación
- `/comments/{branchId}` - Comentarios predefinidos
- `/status/{branchId}` - Estados de pacientes personalizados

**Nivel Waiting Room** (`config.waitingRoom.id` requerido):
- `/waitingRooms/{id}/surgeons` - Cirujanos asignados
- `/waitingRooms/{id}/procedures` - Procedimientos disponibles
- `/waitingRooms/{id}/operating-rooms-schedules` - Quirófanos activos

**Nivel Operating Room** (ID individual de quirófano):
- `/operating-rooms/{id}/patients` - Pacientes asignados al quirófano
- `/operating-room-users?waiting_room_id={id}` - Personal médico

**Queries de Pacientes** (requiere ambos IDs):
```typescript
// Patrón usado en getPatients()
`${environment.url}/visitor?visit_date=${YYYY-MM-DD}&branchID=${config.branch.id}&roomID=${config.waitingRoom.id}`
```

### Canales Pusher por Nivel
```typescript
// Eventos a nivel de Waiting Room (usado en Dashboard)
`rooms.${config.waitingRoom.id}` 
// Eventos: .PatientCreated, .PatientUpdated, .PatientDeleted

// Chat a nivel Branch + Room (usado en PatientChat)
`branch.${config.branch.id}.room.${config.waitingRoom.id}`
// Eventos: .MessageSent, .ChatRoomCreated
```

### Inicialización de Dropdowns
**RequestsService.initDropdowns()** carga recursos comunes al iniciar:
- Comments, OperatingRooms, Surgeons, Procedures, RecoveryRooms
- Se ejecuta después de configurar `config` object
- Datos almacenados en propiedades del servicio para acceso global

### PatientModel - Campos de Jerarquía
```typescript
class PatientModel {
  branch_Id: number;           // FK: A qué hospital pertenece
  waiting_area_Id: number;     // FK: Sala de espera asignada
  operating_room_id: number;   // FK: Quirófano asignado (nullable)
  operating_room_name: string; // Denormalizado para display
  // ... otros 20+ campos
}
```

**Patrón "TO FOLLOW"**: Pacientes sin `operating_room_id` se agrupan en sala virtual "TO FOLLOW" en el Dashboard

## Common Pitfalls

1. **Token Management**: Always check `requestsService.getToken()` before Echo setup
2. **Echo Cleanup**: Missing `ngOnDestroy()` disconnect causes duplicate listeners
3. **Config Dependency**: Many API calls require `config.branch.id` + `config.waitingRoom.id` from LocaldataService
4. **Date Format**: Backend expects `YYYY-MM-DD` for patient queries
5. **Environment Switching**: Update **both** `environment.url` and `environment.pusher.key` when changing backends
6. **Capacitor Sync**: Must run `ionic cap sync` after adding/removing plugins or changing `www/` build output
7. **Animations**: `IonicModule.forRoot({ animated: false })` - animations disabled globally
8. **Config Validation**: Always validate `config.branch` and `config.waitingRoom` exist before API calls - missing config causes 500 errors

## Key Files for Context
- [src/app/dashboard/dashboard.component.ts](src/app/dashboard/dashboard.component.ts) - Main patient board (1618 LOC, core business logic)
- [src/app/api/requests.service.ts](src/app/api/requests.service.ts) - All API endpoints
- [src/environments/environment.ts](src/environments/environment.ts) - Config constants (270 lines)
- [capacitor.config.ts](capacitor.config.ts) - Mobile app config (appId, Live Updates)
- [src/app/app.module.ts](src/app/app.module.ts) - Root module setup (Ionic Storage, HTTP interceptor)
