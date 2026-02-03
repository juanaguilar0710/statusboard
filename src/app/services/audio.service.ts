import { Injectable } from '@angular/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';

@Injectable({
  providedIn: 'root'
})
export class AudioService {
  private isEnabled: boolean = true;
  private preferredLang: string = 'es-US';
  private isInitialized: boolean = false;

  // 🎤 Inicializar TTS con interacción del usuario
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Prueba inicial para verificar que TTS funciona
      // await TextToSpeech.speak({
      //   text: 'Sistema listo',
      //   lang: this.preferredLang,
      //   rate: 1.2,
      //   pitch: 1.0,
      //   volume: 0.8,
      //   category: 'ambient'
      // });
      this.isInitialized = true;
      console.log('✅ AudioService inicializado correctamente');
    } catch (error) {
      console.warn('⚠️ No se pudo inicializar TTS:', error);
      // No marcar como inicializado para reintentar después
    }
  }

  // 🗣️ Reproducir notificación con TTS
  async playNotification(text?: string): Promise<void> {
    if (!this.isEnabled) return;

    if (!text || !text.trim()) {
      text = 'Cargando pacientes, por favor espere';
    }

    try {
      await this.speakWithCapacitorTTS(text);
    } catch (error) {
      console.error('❌ Error en playNotification:', error);
      // Si no está inicializado, intentar inicializar primero
      if (!this.isInitialized) {
        try {
          await this.initialize();
          await this.speakWithCapacitorTTS(text);
        } catch (retryError) {
          console.error('❌ Error en reintento de TTS:', retryError);
        }
      }
    }
  }

  // 🎤 Método principal para TTS
  private async speakWithCapacitorTTS(text: string): Promise<void> {
    const preferredLang = this.getPreferredVoice();
    console.log('🎤 Hablando:', text, 'Idioma:', preferredLang);

    try {
      await TextToSpeech.speak({
        text: text,
        lang: preferredLang,
        rate: 1.0,
        pitch: 1.0,
        volume: 1.0,
        category: 'ambient'
      });

      console.log('✅ TTS completado');
    } catch (error: any) {
      // Manejar errores específicos
      if (error?.message?.includes('not-allowed') || error?.error === 'not-allowed') {
        console.error('🚫 TTS bloqueado - Se requiere interacción del usuario');
        throw new Error('TTS_NOT_ALLOWED');
      } else {
        console.error('❌ Error en TTS:', error);
        throw error;
      }
    }
  }

  // 🔊 Obtener voces disponibles del sistema
  async getAvailableVoices(): Promise<{ name: string, lang: string, gender?: string, isLocal: boolean, isDefault: boolean }[]> {
    try {
      const voices = await TextToSpeech.getSupportedVoices();

      if (voices.voices && voices.voices.length > 0) {
        const formattedVoices = voices.voices.map(voice => ({
          name: voice.name || `Voz ${voice.lang || 'Sistema'}`,
          lang: voice.lang || 'es-ES',
          gender: voice.name?.toLowerCase().includes('female') || voice.name?.toLowerCase().includes('mujer') ? 'Femenino' :
                 voice.name?.toLowerCase().includes('male') || voice.name?.toLowerCase().includes('hombre') ? 'Masculino' : 'Neutral',
          isLocal: true,
          isDefault: voice.lang?.startsWith('es') || voice.lang?.includes('ES') || false
        }));

        return formattedVoices.sort((a, b) => {
          if (a.lang.startsWith('es') && !b.lang.startsWith('es')) return -1;
          if (!a.lang.startsWith('es') && b.lang.startsWith('es')) return 1;
          return a.lang.localeCompare(b.lang);
        });
      }

      return [];
    } catch (error) {
      return [];
    }
  }

  // 🌍 Obtener idiomas disponibles del sistema
  async getAvailableLanguages(): Promise<{ code: string, name: string, voicesCount: number }[]> {
    try {
      const voices = await this.getAvailableVoices();

      if (voices.length === 0) return [];

      const languageMap = new Map<string, { name: string, count: number }>();

      voices.forEach(voice => {
        const langCode = voice.lang;
        const langName = this.getLanguageDisplayName(langCode);

        if (languageMap.has(langCode)) {
          languageMap.get(langCode)!.count++;
        } else {
          languageMap.set(langCode, { name: langName, count: 1 });
        }
      });

      const languages = Array.from(languageMap.entries()).map(([code, info]) => ({
        code: code,
        name: info.name,
        voicesCount: info.count
      }));

      return languages.sort((a, b) => {
        if (a.code.startsWith('es') && !b.code.startsWith('es')) return -1;
        if (!a.code.startsWith('es') && b.code.startsWith('es')) return 1;
        return a.name.localeCompare(b.name);
      });

    } catch (error) {
      return [];
    }
  }

  // 🗺️ Obtener nombre de idioma con bandera
  private getLanguageDisplayName(langCode: string): string {
    const languageNames: { [key: string]: string } = {
      'es-ES': '🇪🇸 Español (España)',
      'es-MX': '🇲🇽 Español (México)',
      'es-AR': '🇦🇷 Español (Argentina)',
      'es-CO': '🇨🇴 Español (Colombia)',
      'es-US': '🇺🇸 Español (Estados Unidos)',
      'en-US': '🇺🇸 Inglés (Estados Unidos)',
      'en-GB': '🇬🇧 Inglés (Reino Unido)',
      'en-AU': '🇦🇺 Inglés (Australia)',
      'en-CA': '🇨🇦 Inglés (Canadá)',
      'fr-FR': '🇫🇷 Francés (Francia)',
      'fr-CA': '🇨🇦 Francés (Canadá)',
      'de-DE': '🇩🇪 Alemán (Alemania)',
      'it-IT': '🇮🇹 Italiano (Italia)',
      'pt-BR': '🇧🇷 Portugués (Brasil)',
      'pt-PT': '🇵🇹 Portugués (Portugal)',
      'ja-JP': '🇯🇵 Japonés (Japón)',
      'ko-KR': '🇰🇷 Coreano (Corea)',
      'zh-CN': '🇨🇳 Chino (China)',
      'ru-RU': '🇷🇺 Ruso (Rusia)',
      'ar-SA': '🇸🇦 Árabe (Arabia Saudí)'
    };

    return languageNames[langCode] || `${langCode.toUpperCase()}`;
  }

  // ⚙️ Configurar y obtener voz preferida
  setPreferredVoice(voicePreference: string) {
    this.preferredLang = voicePreference;
    localStorage.setItem('tts_preferred_voice', voicePreference);
  }

  getPreferredVoice(): string {
    const saved = localStorage.getItem('tts_preferred_voice');
    return saved || this.preferredLang;
  }

  // 🎼 Reproducir diferentes tipos de sonidos
  async playSound(type: 'notification' | 'alert' | 'success' | 'error' = 'notification', text?: string): Promise<void> {
    return this.playNotification(text);
  }

  // 🧪 Test de audio
  async testAudio(message: string = 'Prueba de audio funcionando correctamente'): Promise<void> {
    console.log('🧪 Test de audio iniciado...');
    try {
      await this.speakWithCapacitorTTS(message);
      console.log('✅ Test de audio exitoso');
    } catch (error) {
      console.log('❌ Error en test de audio:', error);
      throw error;
    }
  }

  // 🎭 Probar una voz específica
  async testVoiceWithLanguage(lang: string, message: string = 'Esta es una prueba de voz'): Promise<void> {
    await TextToSpeech.speak({
      text: message,
      lang: lang,
      rate: 1.0,
      pitch: 1.0,
      volume: 1.0,
      category: 'ambient'
    });
  }

  // 🔇 Habilitar/deshabilitar audio
  enableAudio() {
    this.isEnabled = true;
  }

  disableAudio() {
    this.isEnabled = false;
  }
}
