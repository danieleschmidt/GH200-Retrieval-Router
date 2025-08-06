/**
 * Quantum Internationalization Manager
 * Global-first i18n with quantum-inspired language processing
 */

const { logger } = require('../utils/logger');

class QuantumI18n {
    constructor(options = {}) {
        this.config = {
            defaultLanguage: options.defaultLanguage || 'en',
            supportedLanguages: options.supportedLanguages || ['en', 'es', 'fr', 'de', 'ja', 'zh'],
            fallbackLanguage: options.fallbackLanguage || 'en',
            quantumTranslation: options.quantumTranslation !== false,
            cacheTranslations: options.cacheTranslations !== false,
            adaptiveLoading: options.adaptiveLoading !== false,
            ...options
        };

        this.translations = new Map();
        this.translationCache = new Map();
        this.languageDetectors = new Map();
        this.quantumStates = new Map();
        this.isInitialized = false;

        this.initializeLanguageDetectors();
        this.initializeTranslations();
    }

    initializeLanguageDetectors() {
        this.languageDetectors.set('user-agent', this.detectFromUserAgent.bind(this));
        this.languageDetectors.set('accept-language', this.detectFromAcceptLanguage.bind(this));
        this.languageDetectors.set('geo-location', this.detectFromGeoLocation.bind(this));
        this.languageDetectors.set('user-preference', this.detectFromUserPreference.bind(this));
    }

    initializeTranslations() {
        const baseTranslations = {
            en: {
                'quantum.task.created': 'Quantum task created with superposition states',
                'quantum.task.measured': 'Quantum state measured and collapsed',
                'quantum.entanglement.created': 'Quantum entanglement established between tasks',
                'quantum.coherence.maintained': 'Quantum coherence maintained at {coherence}%',
                'quantum.optimization.applied': 'Adaptive optimization applied: {changes} parameters adjusted',
                'quantum.error.decoherence': 'Quantum decoherence detected, reinitializing state',
                'quantum.cache.hit': 'Quantum cache hit with coherence {coherence}',
                'quantum.load.balanced': 'Request routed using quantum coherent balancing',
                'system.performance.excellent': 'System operating at excellent performance levels',
                'system.performance.good': 'System operating at good performance levels',
                'system.performance.degraded': 'System performance degraded, optimization recommended',
                'system.performance.critical': 'Critical performance issues detected',
                'validation.task.invalid': 'Task validation failed: {errors}',
                'validation.quantum.state.invalid': 'Invalid quantum state detected',
                'monitoring.alert.triggered': 'Monitoring alert triggered: {alert}',
                'monitoring.health.good': 'System health is good',
                'monitoring.health.warning': 'System health warning detected'
            },
            es: {
                'quantum.task.created': 'Tarea cuántica creada con estados de superposición',
                'quantum.task.measured': 'Estado cuántico medido y colapsado',
                'quantum.entanglement.created': 'Entrelazamiento cuántico establecido entre tareas',
                'quantum.coherence.maintained': 'Coherencia cuántica mantenida al {coherence}%',
                'quantum.optimization.applied': 'Optimización adaptativa aplicada: {changes} parámetros ajustados',
                'quantum.error.decoherence': 'Decoherencia cuántica detectada, reinicializando estado',
                'quantum.cache.hit': 'Acierto de caché cuántico con coherencia {coherence}',
                'quantum.load.balanced': 'Solicitud enrutada usando balanceo coherente cuántico',
                'system.performance.excellent': 'Sistema operando a niveles de rendimiento excelentes',
                'system.performance.good': 'Sistema operando a niveles de rendimiento buenos',
                'system.performance.degraded': 'Rendimiento del sistema degradado, optimización recomendada',
                'system.performance.critical': 'Problemas críticos de rendimiento detectados',
                'validation.task.invalid': 'Validación de tarea falló: {errors}',
                'validation.quantum.state.invalid': 'Estado cuántico inválido detectado',
                'monitoring.alert.triggered': 'Alerta de monitoreo activada: {alert}',
                'monitoring.health.good': 'La salud del sistema es buena',
                'monitoring.health.warning': 'Advertencia de salud del sistema detectada'
            },
            fr: {
                'quantum.task.created': 'Tâche quantique créée avec des états de superposition',
                'quantum.task.measured': 'État quantique mesuré et effondré',
                'quantum.entanglement.created': 'Intrication quantique établie entre les tâches',
                'quantum.coherence.maintained': 'Cohérence quantique maintenue à {coherence}%',
                'quantum.optimization.applied': 'Optimisation adaptative appliquée: {changes} paramètres ajustés',
                'quantum.error.decoherence': 'Décohérence quantique détectée, réinitialisation de l\'état',
                'quantum.cache.hit': 'Succès du cache quantique avec cohérence {coherence}',
                'quantum.load.balanced': 'Requête routée en utilisant l\'équilibrage cohérent quantique',
                'system.performance.excellent': 'Système fonctionnant à d\'excellents niveaux de performance',
                'system.performance.good': 'Système fonctionnant à de bons niveaux de performance',
                'system.performance.degraded': 'Performance du système dégradée, optimisation recommandée',
                'system.performance.critical': 'Problèmes de performance critiques détectés',
                'validation.task.invalid': 'Validation de tâche échouée: {errors}',
                'validation.quantum.state.invalid': 'État quantique invalide détecté',
                'monitoring.alert.triggered': 'Alerte de surveillance déclenchée: {alert}',
                'monitoring.health.good': 'La santé du système est bonne',
                'monitoring.health.warning': 'Avertissement de santé du système détecté'
            },
            de: {
                'quantum.task.created': 'Quantenaufgabe mit Überlagerungszuständen erstellt',
                'quantum.task.measured': 'Quantenzustand gemessen und kollabiert',
                'quantum.entanglement.created': 'Quantenverschränkung zwischen Aufgaben hergestellt',
                'quantum.coherence.maintained': 'Quantenkohärenz bei {coherence}% aufrechterhalten',
                'quantum.optimization.applied': 'Adaptive Optimierung angewendet: {changes} Parameter angepasst',
                'quantum.error.decoherence': 'Quantendekohärenz erkannt, Zustand wird reinitialisiert',
                'quantum.cache.hit': 'Quanten-Cache-Treffer mit Kohärenz {coherence}',
                'quantum.load.balanced': 'Anfrage mit quantenkohärenter Lastverteilung weitergeleitet',
                'system.performance.excellent': 'System arbeitet auf ausgezeichnetem Leistungsniveau',
                'system.performance.good': 'System arbeitet auf gutem Leistungsniveau',
                'system.performance.degraded': 'Systemleistung verschlechtert, Optimierung empfohlen',
                'system.performance.critical': 'Kritische Leistungsprobleme erkannt',
                'validation.task.invalid': 'Aufgabenvalidierung fehlgeschlagen: {errors}',
                'validation.quantum.state.invalid': 'Ungültiger Quantenzustand erkannt',
                'monitoring.alert.triggered': 'Überwachungsalarm ausgelöst: {alert}',
                'monitoring.health.good': 'Systemzustand ist gut',
                'monitoring.health.warning': 'Systemzustands-Warnung erkannt'
            },
            ja: {
                'quantum.task.created': '量子タスクが重ね合わせ状態で作成されました',
                'quantum.task.measured': '量子状態が測定され、収束しました',
                'quantum.entanglement.created': 'タスク間で量子もつれが確立されました',
                'quantum.coherence.maintained': '量子コヒーレンスが{coherence}%で維持されています',
                'quantum.optimization.applied': '適応最適化が適用されました：{changes}個のパラメータが調整されました',
                'quantum.error.decoherence': '量子デコヒーレンスが検出され、状態を再初期化します',
                'quantum.cache.hit': 'コヒーレンス{coherence}での量子キャッシュヒット',
                'quantum.load.balanced': '量子コヒーレントバランシングを使用してリクエストをルーティングしました',
                'system.performance.excellent': 'システムは優秀なパフォーマンスレベルで動作しています',
                'system.performance.good': 'システムは良好なパフォーマンスレベルで動作しています',
                'system.performance.degraded': 'システムパフォーマンスが低下し、最適化が推奨されます',
                'system.performance.critical': '重大なパフォーマンス問題が検出されました',
                'validation.task.invalid': 'タスク検証が失敗しました：{errors}',
                'validation.quantum.state.invalid': '無効な量子状態が検出されました',
                'monitoring.alert.triggered': '監視アラートがトリガーされました：{alert}',
                'monitoring.health.good': 'システムの健全性は良好です',
                'monitoring.health.warning': 'システム健全性警告が検出されました'
            },
            zh: {
                'quantum.task.created': '量子任务已创建，具有叠加状态',
                'quantum.task.measured': '量子状态已测量并坍缩',
                'quantum.entanglement.created': '任务间建立了量子纠缠',
                'quantum.coherence.maintained': '量子相干性保持在{coherence}%',
                'quantum.optimization.applied': '自适应优化已应用：调整了{changes}个参数',
                'quantum.error.decoherence': '检测到量子退相干，正在重新初始化状态',
                'quantum.cache.hit': '量子缓存命中，相干性为{coherence}',
                'quantum.load.balanced': '使用量子相干平衡路由请求',
                'system.performance.excellent': '系统以出色的性能水平运行',
                'system.performance.good': '系统以良好的性能水平运行',
                'system.performance.degraded': '系统性能下降，建议优化',
                'system.performance.critical': '检测到严重性能问题',
                'validation.task.invalid': '任务验证失败：{errors}',
                'validation.quantum.state.invalid': '检测到无效的量子状态',
                'monitoring.alert.triggered': '监控警报已触发：{alert}',
                'monitoring.health.good': '系统健康状况良好',
                'monitoring.health.warning': '检测到系统健康警告'
            }
        };

        for (const [lang, translations] of Object.entries(baseTranslations)) {
            this.translations.set(lang, new Map(Object.entries(translations)));
        }
    }

    async detectLanguage(context = {}) {
        const detectionResults = new Map();
        
        for (const [detectorName, detector] of this.languageDetectors) {
            try {
                const result = await detector(context);
                if (result && this.config.supportedLanguages.includes(result)) {
                    detectionResults.set(detectorName, result);
                }
            } catch (error) {
                logger.debug(`Language detector ${detectorName} failed:`, error.message);
            }
        }

        if (this.config.quantumTranslation) {
            return this.quantumLanguageSelection(detectionResults, context);
        }

        return this.classicalLanguageSelection(detectionResults);
    }

    async quantumLanguageSelection(detectionResults, context) {
        if (detectionResults.size === 0) {
            return this.config.defaultLanguage;
        }

        const languages = Array.from(detectionResults.values());
        const uniqueLanguages = [...new Set(languages)];

        if (uniqueLanguages.length === 1) {
            return uniqueLanguages[0];
        }

        const quantumState = this.createLanguageQuantumState(uniqueLanguages, detectionResults, context);
        const selectedLanguage = this.measureLanguageState(quantumState);
        
        logger.debug('Quantum language selection:', {
            detected: Object.fromEntries(detectionResults),
            selected: selectedLanguage,
            superposition: quantumState.superposition.map(s => ({ lang: s.language, prob: s.probability }))
        });

        return selectedLanguage;
    }

    createLanguageQuantumState(languages, detectionResults, context) {
        const superposition = languages.map(lang => {
            let amplitude = 0.25; // Base amplitude
            
            const detectionCount = Array.from(detectionResults.values()).filter(l => l === lang).length;
            amplitude += (detectionCount / detectionResults.size) * 0.5;
            
            if (lang === context.userPreference) {
                amplitude += 0.3;
            }
            
            if (lang === this.config.defaultLanguage) {
                amplitude += 0.1;
            }
            
            const regionBonus = this.getRegionLanguageBonus(lang, context.geoLocation);
            amplitude += regionBonus;
            
            return {
                language: lang,
                amplitude: amplitude,
                probability: amplitude * amplitude,
                confidence: this.calculateLanguageConfidence(lang, detectionResults, context)
            };
        });

        const totalProbability = superposition.reduce((sum, state) => sum + state.probability, 0);
        superposition.forEach(state => {
            state.probability = state.probability / totalProbability;
        });

        return {
            superposition: superposition,
            coherence: this.calculateLanguageCoherence(detectionResults),
            context: context,
            createdAt: Date.now()
        };
    }

    getRegionLanguageBonus(language, geoLocation) {
        if (!geoLocation) return 0;

        const regionMappings = {
            'es': ['ES', 'MX', 'AR', 'CO', 'PE', 'VE', 'CL', 'EC', 'BO', 'PY', 'UY'],
            'fr': ['FR', 'CA', 'BE', 'CH', 'LU', 'MC'],
            'de': ['DE', 'AT', 'CH', 'LI'],
            'ja': ['JP'],
            'zh': ['CN', 'TW', 'HK', 'MO', 'SG'],
            'en': ['US', 'GB', 'CA', 'AU', 'NZ', 'IE', 'ZA', 'IN', 'SG']
        };

        const countries = regionMappings[language] || [];
        return countries.includes(geoLocation.countryCode) ? 0.2 : 0;
    }

    calculateLanguageConfidence(language, detectionResults, context) {
        let confidence = 0.5; // Base confidence

        const detectionCount = Array.from(detectionResults.values()).filter(l => l === language).length;
        confidence += (detectionCount / Math.max(detectionResults.size, 1)) * 0.3;

        if (language === context.userPreference) {
            confidence += 0.2;
        }

        if (this.config.supportedLanguages.includes(language)) {
            confidence += 0.1;
        }

        return Math.min(1.0, confidence);
    }

    calculateLanguageCoherence(detectionResults) {
        if (detectionResults.size <= 1) return 1.0;

        const languages = Array.from(detectionResults.values());
        const uniqueLanguages = new Set(languages);
        
        const coherence = uniqueLanguages.size / languages.length;
        return Math.max(0.1, coherence);
    }

    measureLanguageState(quantumState) {
        const random = Math.random();
        let cumulativeProbability = 0;

        for (const state of quantumState.superposition) {
            cumulativeProbability += state.probability;
            if (random <= cumulativeProbability) {
                return state.language;
            }
        }

        return quantumState.superposition[quantumState.superposition.length - 1].language;
    }

    classicalLanguageSelection(detectionResults) {
        const languageCounts = new Map();
        
        for (const language of detectionResults.values()) {
            languageCounts.set(language, (languageCounts.get(language) || 0) + 1);
        }

        if (languageCounts.size === 0) {
            return this.config.defaultLanguage;
        }

        const mostDetected = Array.from(languageCounts.entries())
            .sort((a, b) => b[1] - a[1])[0][0];

        return mostDetected;
    }

    async detectFromUserAgent(context) {
        const userAgent = context.userAgent || context.headers?.['user-agent'];
        if (!userAgent) return null;

        const languagePatterns = {
            'es': /es[-_]ES|es[-_]MX|es[-_]AR|spanish/i,
            'fr': /fr[-_]FR|fr[-_]CA|french/i,
            'de': /de[-_]DE|de[-_]AT|german/i,
            'ja': /ja[-_]JP|japanese/i,
            'zh': /zh[-_]CN|zh[-_]TW|chinese/i,
            'en': /en[-_]US|en[-_]GB|english/i
        };

        for (const [lang, pattern] of Object.entries(languagePatterns)) {
            if (pattern.test(userAgent)) {
                return lang;
            }
        }

        return null;
    }

    async detectFromAcceptLanguage(context) {
        const acceptLanguage = context.acceptLanguage || context.headers?.['accept-language'];
        if (!acceptLanguage) return null;

        const languages = acceptLanguage.split(',')
            .map(lang => {
                const [code, q] = lang.trim().split(';q=');
                const quality = q ? parseFloat(q) : 1.0;
                const langCode = code.split('-')[0].toLowerCase();
                return { code: langCode, quality };
            })
            .sort((a, b) => b.quality - a.quality);

        for (const lang of languages) {
            if (this.config.supportedLanguages.includes(lang.code)) {
                return lang.code;
            }
        }

        return null;
    }

    async detectFromGeoLocation(context) {
        const geoLocation = context.geoLocation;
        if (!geoLocation || !geoLocation.countryCode) return null;

        const countryLanguageMap = {
            'ES': 'es', 'MX': 'es', 'AR': 'es', 'CO': 'es', 'PE': 'es',
            'FR': 'fr', 'CA': 'fr', 'BE': 'fr',
            'DE': 'de', 'AT': 'de', 'CH': 'de',
            'JP': 'ja',
            'CN': 'zh', 'TW': 'zh', 'HK': 'zh',
            'US': 'en', 'GB': 'en', 'AU': 'en', 'NZ': 'en', 'IE': 'en'
        };

        return countryLanguageMap[geoLocation.countryCode] || null;
    }

    async detectFromUserPreference(context) {
        return context.userPreference || context.user?.preferredLanguage || null;
    }

    translate(key, params = {}, language = null) {
        const targetLanguage = language || this.currentLanguage || this.config.defaultLanguage;
        
        if (this.config.cacheTranslations) {
            const cacheKey = `${targetLanguage}:${key}:${JSON.stringify(params)}`;
            if (this.translationCache.has(cacheKey)) {
                return this.translationCache.get(cacheKey);
            }
        }

        const translation = this.getTranslation(key, targetLanguage, params);
        
        if (this.config.cacheTranslations) {
            const cacheKey = `${targetLanguage}:${key}:${JSON.stringify(params)}`;
            this.translationCache.set(cacheKey, translation);
            
            if (this.translationCache.size > 10000) {
                const firstKey = this.translationCache.keys().next().value;
                this.translationCache.delete(firstKey);
            }
        }

        return translation;
    }

    getTranslation(key, language, params) {
        let translation = this.getTranslationForLanguage(key, language);
        
        if (!translation && language !== this.config.fallbackLanguage) {
            translation = this.getTranslationForLanguage(key, this.config.fallbackLanguage);
        }
        
        if (!translation) {
            logger.warn(`Translation not found: ${key} for language: ${language}`);
            return key;
        }

        return this.interpolateParams(translation, params);
    }

    getTranslationForLanguage(key, language) {
        const languageTranslations = this.translations.get(language);
        return languageTranslations ? languageTranslations.get(key) : null;
    }

    interpolateParams(translation, params) {
        if (!params || Object.keys(params).length === 0) {
            return translation;
        }

        return translation.replace(/\{(\w+)\}/g, (match, paramName) => {
            return params[paramName] !== undefined ? params[paramName] : match;
        });
    }

    addTranslation(language, key, value) {
        if (!this.translations.has(language)) {
            this.translations.set(language, new Map());
        }
        
        this.translations.get(language).set(key, value);
        
        if (this.config.cacheTranslations) {
            this.translationCache.clear();
        }
    }

    addTranslations(language, translations) {
        if (!this.translations.has(language)) {
            this.translations.set(language, new Map());
        }
        
        const languageMap = this.translations.get(language);
        for (const [key, value] of Object.entries(translations)) {
            languageMap.set(key, value);
        }
        
        if (this.config.cacheTranslations) {
            this.translationCache.clear();
        }
    }

    getSupportedLanguages() {
        return [...this.config.supportedLanguages];
    }

    getCurrentLanguage() {
        return this.currentLanguage || this.config.defaultLanguage;
    }

    setCurrentLanguage(language) {
        if (this.config.supportedLanguages.includes(language)) {
            this.currentLanguage = language;
            logger.debug(`Language set to: ${language}`);
            return true;
        }
        
        logger.warn(`Unsupported language: ${language}`);
        return false;
    }

    async middleware(req, res, next) {
        try {
            const context = {
                userAgent: req.headers['user-agent'],
                acceptLanguage: req.headers['accept-language'],
                userPreference: req.user?.preferredLanguage,
                geoLocation: req.geoLocation,
                headers: req.headers
            };

            const detectedLanguage = await this.detectLanguage(context);
            req.language = detectedLanguage;
            req.t = (key, params) => this.translate(key, params, detectedLanguage);
            
            res.locals.language = detectedLanguage;
            res.locals.t = req.t;

            logger.debug('I18n middleware applied', {
                detectedLanguage: detectedLanguage,
                userAgent: context.userAgent,
                acceptLanguage: context.acceptLanguage
            });

            next();
        } catch (error) {
            logger.error('I18n middleware error:', error);
            req.language = this.config.defaultLanguage;
            req.t = (key, params) => this.translate(key, params, this.config.defaultLanguage);
            next();
        }
    }

    getTranslationStats() {
        const stats = {
            supportedLanguages: this.config.supportedLanguages.length,
            totalTranslations: 0,
            translationsPerLanguage: {},
            cacheSize: this.translationCache.size,
            quantumEnabled: this.config.quantumTranslation
        };

        for (const [language, translations] of this.translations) {
            const count = translations.size;
            stats.translationsPerLanguage[language] = count;
            stats.totalTranslations += count;
        }

        return stats;
    }

    clearCache() {
        this.translationCache.clear();
        logger.info('Translation cache cleared');
    }
}

module.exports = { QuantumI18n };