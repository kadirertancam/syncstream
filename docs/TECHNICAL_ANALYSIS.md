# SyncStream - Senkronize Medya Streaming Platform

## 📋 Proje Özeti

**SyncStream**, kullanıcıların aynı anda senkronize şekilde video izlemesini ve müzik dinlemesini sağlayan profesyonel bir web uygulamasıdır. Platform, YouTube, Spotify ve özel URL'lerden medya içeriğini destekler.

---

## 🎯 Temel Özellikler

### 1. Medya Senkronizasyonu
- **YouTube Integration**: YouTube videolarını embed API ile senkronize izleme
- **URL Video Player**: MP4, WebM, HLS formatlarını destekleyen özel video player
- **Spotify Embed**: Spotify track, playlist ve albüm desteği
- **Gerçek Zamanlı Sync**: Play/pause/seek işlemlerinin anlık senkronizasyonu

### 2. Oda Sistemi
- **Benzersiz Oda Kodları**: 6 haneli alfanumerik kodlar (ör: AB3XY9)
- **Host Yetkileri**: Medya değiştirme, oynatma kontrolü
- **Katılımcı Yönetimi**: Max 50 kullanıcı/oda
- **Otomatik Host Devri**: Host ayrılınca yeni host atama

### 3. İletişim
- **Live Chat**: Gerçek zamanlı mesajlaşma
- **Typing Indicators**: Yazıyor göstergesi
- **System Messages**: Oda olayları bildirimleri
- **Emoji Support**: Avatar ve mesajlarda emoji desteği

---

## 🏗️ Sistem Mimarisi

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   React App  │  │   iOS App    │  │  Android App │          │
│  │   (Web)      │  │  (Capacitor) │  │  (Capacitor) │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
│         └─────────────────┼─────────────────┘                   │
│                           │                                     │
│                    WebSocket / REST                             │
└───────────────────────────┼─────────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────────┐
│                    API GATEWAY LAYER                             │
├───────────────────────────┼─────────────────────────────────────┤
│                    ┌──────┴──────┐                              │
│                    │   Nginx     │                              │
│                    │   (LB/SSL)  │                              │
│                    └──────┬──────┘                              │
│                           │                                     │
│         ┌─────────────────┼─────────────────┐                   │
│         │                 │                 │                   │
│  ┌──────┴──────┐  ┌───────┴──────┐  ┌──────┴──────┐            │
│  │  Server 1   │  │   Server 2   │  │  Server 3   │            │
│  │  (Node.js)  │  │   (Node.js)  │  │  (Node.js)  │            │
│  └──────┬──────┘  └───────┬──────┘  └──────┬──────┘            │
│         │                 │                 │                   │
│         └─────────────────┼─────────────────┘                   │
│                           │                                     │
└───────────────────────────┼─────────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────────┐
│                      DATA LAYER                                  │
├───────────────────────────┼─────────────────────────────────────┤
│         ┌─────────────────┼─────────────────┐                   │
│         │                 │                 │                   │
│  ┌──────┴──────┐  ┌───────┴──────┐  ┌──────┴──────┐            │
│  │ Redis       │  │  PostgreSQL  │  │    S3       │            │
│  │ (Cache/Pub) │  │   (Users)    │  │  (Assets)   │            │
│  └─────────────┘  └──────────────┘  └─────────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📊 Veri Modelleri

### Room Schema
```typescript
interface Room {
  id: string;              // 6 haneli benzersiz kod
  name: string;            // Oda adı
  hostId: string;          // Host kullanıcı ID
  createdAt: number;       // Unix timestamp
  mediaType: 'youtube' | 'url' | 'spotify' | null;
  mediaUrl: string | null;
  isPlaying: boolean;
  currentTime: number;     // Saniye cinsinden
  lastSync: number;        // Son sync zamanı
}
```

### User Schema
```typescript
interface User {
  id: string;              // Benzersiz kullanıcı ID
  name: string;            // Görünen ad
  avatar: string;          // Emoji avatar
  socketId: string;        // Socket.io bağlantı ID
  joinedAt: number;        // Odaya katılma zamanı
  isHost: boolean;         // Host yetkisi
}
```

### Message Schema
```typescript
interface Message {
  id: string;
  type: 'user' | 'system';
  userId?: string;
  userName?: string;
  userAvatar?: string;
  text: string;
  timestamp: number;
}
```

---

## 🔌 WebSocket Events

### Client → Server
| Event | Payload | Açıklama |
|-------|---------|----------|
| `join_room` | `{ roomId, user }` | Odaya katılma |
| `leave_room` | - | Odadan ayrılma |
| `media_change` | `{ mediaType, mediaUrl }` | Medya değiştirme |
| `playback_state` | `{ isPlaying, currentTime }` | Play/Pause |
| `seek` | `{ currentTime }` | Zaman atlama |
| `chat_message` | `{ text }` | Mesaj gönderme |
| `typing_start` | - | Yazıyor başlat |
| `typing_stop` | - | Yazıyor durdur |
| `request_sync` | - | Sync talep et |

### Server → Client
| Event | Payload | Açıklama |
|-------|---------|----------|
| `room_joined` | `{ room, participants, messages }` | Odaya katılım onayı |
| `participant_joined` | `{ user }` | Yeni katılımcı |
| `participant_left` | `{ userId, userName }` | Katılımcı ayrıldı |
| `media_changed` | `{ mediaType, mediaUrl }` | Medya değişti |
| `playback_sync` | `{ isPlaying, currentTime }` | Oynatma sync |
| `seek_sync` | `{ currentTime }` | Seek sync |
| `chat_message` | `{ message }` | Yeni mesaj |
| `host_changed` | `{ newHostId }` | Host değişti |
| `error` | `{ message }` | Hata mesajı |

---

## 🔐 Güvenlik Önlemleri

### 1. Rate Limiting
```javascript
// API rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 100 // max istek sayısı
});

// WebSocket rate limiting
const socketRateLimit = {
  messages: 30,      // 30 mesaj
  window: 60000,     // dakikada
  blockDuration: 300000 // 5 dk engel
};
```

### 2. Input Validation
- Oda kodu: 6 karakter, alfanumerik
- Kullanıcı adı: max 20 karakter
- Mesaj: max 500 karakter
- URL: geçerli URL formatı kontrolü

### 3. XSS Prevention
- React otomatik escaping
- DOMPurify ile sanitization
- CSP headers

### 4. CORS Configuration
```javascript
cors: {
  origin: ['https://syncstream.app', 'https://app.syncstream.app'],
  credentials: true,
  methods: ['GET', 'POST']
}
```

---

## 📈 Ölçeklenebilirlik

### Horizontal Scaling
```yaml
# docker-compose.yml
version: '3.8'
services:
  syncstream:
    image: syncstream:latest
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '1'
          memory: 1G
    environment:
      - REDIS_HOST=redis
      - NODE_ENV=production

  redis:
    image: redis:alpine
    deploy:
      replicas: 1
    volumes:
      - redis-data:/data

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
```

### Redis Cluster
```javascript
// Socket.io Redis adapter for scaling
const { createAdapter } = require('@socket.io/redis-adapter');
const pubClient = createClient({ url: 'redis://redis:6379' });
const subClient = pubClient.duplicate();

io.adapter(createAdapter(pubClient, subClient));
```

---

## 🎨 UI/UX Tasarım Prensipleri

### Renk Paleti
```css
:root {
  --bg-primary: #0a0a0f;        /* Ana arka plan */
  --bg-secondary: #12121a;      /* İkincil arka plan */
  --accent-primary: #A855F7;    /* Mor vurgu */
  --accent-secondary: #06B6D4;  /* Cyan vurgu */
  --accent-tertiary: #FF6B6B;   /* Kırmızı vurgu */
}
```

### Typography
- **Heading Font**: Plus Jakarta Sans (800 weight)
- **Body Font**: Plus Jakarta Sans (400-600 weight)
- **Mono Font**: JetBrains Mono (oda kodları)

### Animasyonlar
- Fade-in-up: Sayfa geçişleri
- Pulse: Logo animasyonu
- Float: Background orbs
- Spin: Loading spinner

---

## 💰 Monetizasyon Stratejileri

### 1. Freemium Model
| Özellik | Free | Pro ($9.99/ay) | Enterprise |
|---------|------|----------------|------------|
| Oda kapasitesi | 10 kişi | 50 kişi | Sınırsız |
| Video kalitesi | 720p | 4K | 4K |
| Chat geçmişi | 24 saat | 30 gün | Sınırsız |
| Özel odalar | ❌ | ✅ | ✅ |
| API erişimi | ❌ | ❌ | ✅ |
| Öncelikli destek | ❌ | ✅ | ✅ |

### 2. B2B Lisanslama
- White-label çözüm
- Self-hosted deployment
- Özel entegrasyonlar
- SLA garantisi

### 3. API Marketplace
- Developer API
- Webhook entegrasyonları
- Custom player SDK

---

## 🚀 Deployment Checklist

### Production Environment
- [ ] SSL sertifikası (Let's Encrypt)
- [ ] CDN yapılandırması (CloudFlare)
- [ ] Redis cluster kurulumu
- [ ] PostgreSQL replication
- [ ] Log aggregation (ELK Stack)
- [ ] Monitoring (Prometheus + Grafana)
- [ ] Error tracking (Sentry)
- [ ] Backup stratejisi

### Performance Optimization
- [ ] Gzip compression
- [ ] Asset minification
- [ ] Image optimization
- [ ] Code splitting
- [ ] Service worker (PWA)
- [ ] CDN caching

---

## 📱 Mobile App (Capacitor)

```javascript
// capacitor.config.ts
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.syncstream.mobile',
  appName: 'SyncStream',
  webDir: 'build',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0a0a0f'
    }
  }
};

export default config;
```

---

## 🔧 Geliştirme Ortamı

### Gereksinimler
- Node.js 18+
- Redis 7+
- PostgreSQL 15+
- pnpm veya yarn

### Kurulum
```bash
# Clone repo
git clone https://github.com/syncstream/app.git
cd app

# Install dependencies
pnpm install

# Start Redis
docker run -d -p 6379:6379 redis:alpine

# Development
pnpm dev

# Production build
pnpm build
pnpm start
```

### Environment Variables
```env
# .env.production
NODE_ENV=production
PORT=3001
REDIS_HOST=redis.syncstream.app
REDIS_PORT=6379
REDIS_PASSWORD=your-secure-password
CORS_ORIGIN=https://syncstream.app
JWT_SECRET=your-jwt-secret
SPOTIFY_CLIENT_ID=your-spotify-id
YOUTUBE_API_KEY=your-youtube-key
```

---

## 📊 Analytics & Metrics

### Key Performance Indicators
- **DAU/MAU**: Günlük/Aylık aktif kullanıcı
- **Session Duration**: Ortalama oturum süresi
- **Room Creation Rate**: Oda oluşturma oranı
- **Message Volume**: Mesaj hacmi
- **Media Type Distribution**: Medya türü dağılımı
- **Churn Rate**: Kullanıcı kaybı oranı

### Monitoring Dashboard
```javascript
// Prometheus metrics
const metrics = {
  activeRooms: new Gauge({ name: 'syncstream_active_rooms' }),
  activeUsers: new Gauge({ name: 'syncstream_active_users' }),
  messagesPerMinute: new Counter({ name: 'syncstream_messages_total' }),
  wsConnections: new Gauge({ name: 'syncstream_ws_connections' }),
  apiLatency: new Histogram({ name: 'syncstream_api_latency_seconds' })
};
```

---

## 🛣️ Roadmap

### Q1 2024
- [x] MVP Launch
- [x] YouTube & URL support
- [x] Basic chat
- [ ] Spotify full integration

### Q2 2024
- [ ] Screen sharing
- [ ] Voice chat (WebRTC)
- [ ] Mobile apps (iOS/Android)
- [ ] Premium subscriptions

### Q3 2024
- [ ] Virtual watch parties
- [ ] Social features (friends, profiles)
- [ ] Browser extension
- [ ] API marketplace

### Q4 2024
- [ ] Enterprise features
- [ ] White-label solution
- [ ] Advanced analytics
- [ ] AI recommendations

---

## 📞 Destek & İletişim

- **Documentation**: https://docs.syncstream.app
- **API Reference**: https://api.syncstream.app/docs
- **Support**: support@syncstream.app
- **GitHub**: https://github.com/syncstream

---

*SyncStream © 2024 - Watch Together. Listen Together. Experience Together.*
