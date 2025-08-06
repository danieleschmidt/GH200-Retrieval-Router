/**
 * Quantum Compliance Manager
 * Global privacy and regulatory compliance with quantum-inspired data protection
 */

const { logger } = require('../utils/logger');
const crypto = require('crypto');

class QuantumCompliance {
    constructor(options = {}) {
        this.config = {
            enableGDPR: options.enableGDPR !== false,
            enableCCPA: options.enableCCPA !== false,
            enablePDPA: options.enablePDPA !== false,
            enableLGPD: options.enableLGPD !== false, // Brazilian General Data Protection Law
            dataRetentionDays: options.dataRetentionDays || 365,
            encryptionAlgorithm: options.encryptionAlgorithm || 'aes-256-gcm',
            quantumSafeCrypto: options.quantumSafeCrypto || false,
            auditLogging: options.auditLogging !== false,
            consentTracking: options.consentTracking !== false,
            rightToBeforgotten: options.rightToBeforgotten !== false,
            dataMinimization: options.dataMinimization !== false,
            ...options
        };

        this.consentRecords = new Map();
        this.dataProcessingLog = [];
        this.encryptionKeys = new Map();
        this.complianceRules = new Map();
        this.auditTrail = [];
        
        this.initializeComplianceRules();
        this.initializeEncryption();
    }

    initializeComplianceRules() {
        // GDPR Rules (EU)
        this.complianceRules.set('GDPR', {
            jurisdiction: 'EU',
            dataRetentionMaxDays: 1095, // 3 years max for most data
            explicitConsent: true,
            rightToAccess: true,
            rightToRectification: true,
            rightToErasure: true,
            rightToPortability: true,
            rightToRestriction: true,
            dataProtectionByDesign: true,
            dataBreachNotification: 72, // hours
            dpoRequired: true,
            lawfulBasis: [
                'consent',
                'contract',
                'legal_obligation',
                'vital_interests',
                'public_task',
                'legitimate_interests'
            ]
        });

        // CCPA Rules (California, USA)
        this.complianceRules.set('CCPA', {
            jurisdiction: 'CA-US',
            dataRetentionMaxDays: 730, // 2 years
            optOutRequired: true,
            rightToKnow: true,
            rightToDelete: true,
            rightToNonDiscrimination: true,
            saleOfPersonalInfo: false, // Default: don't sell
            dataBreachNotification: 72, // hours
            verifiableConsumerRequest: true,
            businessPurposeDisclosure: true
        });

        // PDPA Rules (Singapore)
        this.complianceRules.set('PDPA', {
            jurisdiction: 'SG',
            dataRetentionMaxDays: 1095, // 3 years
            consentRequired: true,
            purposeLimitation: true,
            notificationOfCollection: true,
            accessRights: true,
            correctionRights: true,
            dataBreachNotification: 72, // hours
            dpoAppointment: true,
            dataTransferRestrictions: true
        });

        // LGPD Rules (Brazil)
        this.complianceRules.set('LGPD', {
            jurisdiction: 'BR',
            dataRetentionMaxDays: 1095, // 3 years
            explicitConsent: true,
            rightToAccess: true,
            rightToCorrection: true,
            rightToErasure: true,
            rightToPortability: true,
            dataBreachNotification: 72, // hours
            dpoRequired: true,
            lawfulBases: [
                'consent',
                'legal_compliance',
                'public_administration',
                'research',
                'contract_execution',
                'judicial_process',
                'life_protection',
                'health_protection',
                'legitimate_interest'
            ]
        });
    }

    initializeEncryption() {
        if (this.config.quantumSafeCrypto) {
            // Future: Implement post-quantum cryptography algorithms
            logger.info('Quantum-safe cryptography enabled (simulation)');
        }
        
        // Generate master encryption key
        this.masterKey = crypto.randomBytes(32);
        logger.info('Master encryption key initialized');
    }

    async processPersonalData(data, processingContext) {
        const jurisdiction = this.detectJurisdiction(processingContext);
        const applicableRules = this.getApplicableRules(jurisdiction);
        
        // Validate processing legitimacy
        const validationResult = await this.validateProcessing(data, processingContext, applicableRules);
        if (!validationResult.isValid) {
            throw new ComplianceError(`Processing not compliant: ${validationResult.reasons.join(', ')}`);
        }

        // Apply data minimization
        const minimizedData = this.config.dataMinimization ? 
            this.applyDataMinimization(data, processingContext.purpose) : data;

        // Encrypt sensitive data
        const encryptedData = await this.encryptSensitiveFields(minimizedData);

        // Log processing activity
        await this.logDataProcessing({
            dataSubject: processingContext.dataSubject,
            dataTypes: this.identifyDataTypes(minimizedData),
            purpose: processingContext.purpose,
            legalBasis: processingContext.legalBasis,
            jurisdiction: jurisdiction,
            timestamp: Date.now(),
            retention: this.calculateRetentionPeriod(processingContext.purpose, applicableRules)
        });

        return {
            processedData: encryptedData,
            complianceInfo: {
                jurisdiction: jurisdiction,
                legalBasis: processingContext.legalBasis,
                retentionPeriod: this.calculateRetentionPeriod(processingContext.purpose, applicableRules),
                dataTypes: this.identifyDataTypes(minimizedData)
            }
        };
    }

    detectJurisdiction(context) {
        // Priority order: explicit setting, user location, IP geolocation, default
        if (context.jurisdiction) {
            return context.jurisdiction;
        }

        if (context.userLocation) {
            const { country, region } = context.userLocation;
            if (country === 'US' && region === 'CA') return 'CCPA';
            if (['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'].includes(country)) {
                return 'GDPR';
            }
            if (country === 'SG') return 'PDPA';
            if (country === 'BR') return 'LGPD';
        }

        if (context.ipGeoLocation) {
            return this.detectJurisdiction({ userLocation: context.ipGeoLocation });
        }

        return 'GDPR'; // Default to most restrictive
    }

    getApplicableRules(jurisdiction) {
        const rules = [];
        
        // Always apply GDPR if enabled (extraterritorial effect)
        if (this.config.enableGDPR && (jurisdiction === 'GDPR' || this.hasEUDataSubjects())) {
            rules.push(this.complianceRules.get('GDPR'));
        }
        
        if (this.config.enableCCPA && jurisdiction === 'CCPA') {
            rules.push(this.complianceRules.get('CCPA'));
        }
        
        if (this.config.enablePDPA && jurisdiction === 'PDPA') {
            rules.push(this.complianceRules.get('PDPA'));
        }
        
        if (this.config.enableLGPD && jurisdiction === 'LGPD') {
            rules.push(this.complianceRules.get('LGPD'));
        }

        return rules;
    }

    hasEUDataSubjects() {
        // Check if system processes EU residents' data
        return true; // Conservative assumption
    }

    async validateProcessing(data, context, rules) {
        const validationResult = {
            isValid: true,
            reasons: []
        };

        // Check consent requirements
        if (this.requiresConsent(context.purpose, rules)) {
            const hasValidConsent = await this.checkConsent(context.dataSubject, context.purpose);
            if (!hasValidConsent) {
                validationResult.isValid = false;
                validationResult.reasons.push('Valid consent required but not found');
            }
        }

        // Check legal basis
        if (!this.hasValidLegalBasis(context.legalBasis, rules)) {
            validationResult.isValid = false;
            validationResult.reasons.push('Invalid legal basis for processing');
        }

        // Check purpose limitation
        if (!this.purposeIsAllowed(context.purpose, data, rules)) {
            validationResult.isValid = false;
            validationResult.reasons.push('Purpose not compatible with collected data');
        }

        // Check data retention limits
        const retentionPeriod = this.calculateRetentionPeriod(context.purpose, rules);
        if (retentionPeriod > this.getMaxRetentionPeriod(rules)) {
            validationResult.isValid = false;
            validationResult.reasons.push('Retention period exceeds legal limits');
        }

        return validationResult;
    }

    requiresConsent(purpose, rules) {
        for (const rule of rules) {
            if (rule.explicitConsent && !this.isExemptFromConsent(purpose)) {
                return true;
            }
        }
        return false;
    }

    isExemptFromConsent(purpose) {
        const exemptPurposes = [
            'legal_obligation',
            'vital_interests',
            'public_task',
            'contract_execution'
        ];
        return exemptPurposes.includes(purpose);
    }

    async checkConsent(dataSubject, purpose) {
        const consentKey = `${dataSubject}:${purpose}`;
        const consent = this.consentRecords.get(consentKey);
        
        if (!consent) return false;
        
        // Check if consent is still valid (not expired)
        const consentAgeMs = Date.now() - consent.timestamp;
        const maxConsentAgeMs = 365 * 24 * 60 * 60 * 1000; // 1 year
        
        if (consentAgeMs > maxConsentAgeMs) {
            this.consentRecords.delete(consentKey);
            return false;
        }
        
        return consent.granted && !consent.withdrawn;
    }

    hasValidLegalBasis(legalBasis, rules) {
        for (const rule of rules) {
            if (rule.lawfulBasis && !rule.lawfulBasis.includes(legalBasis)) {
                return false;
            }
            if (rule.lawfulBases && !rule.lawfulBases.includes(legalBasis)) {
                return false;
            }
        }
        return true;
    }

    purposeIsAllowed(purpose, data, rules) {
        // Check purpose limitation principle
        const dataTypes = this.identifyDataTypes(data);
        const allowedPurposes = this.getAllowedPurposes(dataTypes);
        
        return allowedPurposes.includes(purpose) || purpose === 'system_operation';
    }

    identifyDataTypes(data) {
        const dataTypes = [];
        
        if (this.containsPII(data)) dataTypes.push('PII');
        if (this.containsSensitiveData(data)) dataTypes.push('sensitive');
        if (this.containsHealthData(data)) dataTypes.push('health');
        if (this.containsFinancialData(data)) dataTypes.push('financial');
        if (this.containsBiometricData(data)) dataTypes.push('biometric');
        if (this.containsLocationData(data)) dataTypes.push('location');
        
        return dataTypes;
    }

    containsPII(data) {
        const piiFields = ['name', 'email', 'phone', 'address', 'ssn', 'id_number'];
        return piiFields.some(field => this.hasField(data, field));
    }

    containsSensitiveData(data) {
        const sensitiveFields = ['race', 'religion', 'political_opinion', 'sexual_orientation', 'criminal_record'];
        return sensitiveFields.some(field => this.hasField(data, field));
    }

    containsHealthData(data) {
        const healthFields = ['medical_record', 'diagnosis', 'treatment', 'medication', 'health_status'];
        return healthFields.some(field => this.hasField(data, field));
    }

    containsFinancialData(data) {
        const financialFields = ['credit_card', 'bank_account', 'income', 'credit_score', 'financial_status'];
        return financialFields.some(field => this.hasField(data, field));
    }

    containsBiometricData(data) {
        const biometricFields = ['fingerprint', 'face_scan', 'iris_scan', 'voice_print', 'dna'];
        return biometricFields.some(field => this.hasField(data, field));
    }

    containsLocationData(data) {
        const locationFields = ['latitude', 'longitude', 'address', 'city', 'country', 'zip_code', 'ip_address'];
        return locationFields.some(field => this.hasField(data, field));
    }

    hasField(data, fieldName) {
        if (typeof data !== 'object') return false;
        
        const checkObject = (obj, field) => {
            if (obj.hasOwnProperty(field)) return true;
            
            for (const key in obj) {
                if (typeof obj[key] === 'object' && obj[key] !== null) {
                    if (checkObject(obj[key], field)) return true;
                }
            }
            return false;
        };
        
        return checkObject(data, fieldName);
    }

    getAllowedPurposes(dataTypes) {
        const purposeMap = {
            'PII': ['user_registration', 'account_management', 'communication'],
            'sensitive': ['explicit_consent_purpose'],
            'health': ['medical_treatment', 'health_research'],
            'financial': ['payment_processing', 'fraud_prevention'],
            'biometric': ['authentication', 'security'],
            'location': ['service_delivery', 'analytics']
        };
        
        const allowedPurposes = new Set(['system_operation']);
        
        dataTypes.forEach(type => {
            if (purposeMap[type]) {
                purposeMap[type].forEach(purpose => allowedPurposes.add(purpose));
            }
        });
        
        return Array.from(allowedPurposes);
    }

    calculateRetentionPeriod(purpose, rules) {
        const purposeRetention = {
            'user_registration': 2555, // 7 years
            'account_management': 365, // 1 year after account closure
            'communication': 1095, // 3 years
            'payment_processing': 2555, // 7 years (regulatory requirement)
            'fraud_prevention': 2555, // 7 years
            'analytics': 730, // 2 years
            'system_operation': 90, // 3 months
            'security': 365 // 1 year
        };
        
        let retentionDays = purposeRetention[purpose] || this.config.dataRetentionDays;
        
        // Apply regulatory limits
        for (const rule of rules) {
            if (rule.dataRetentionMaxDays && retentionDays > rule.dataRetentionMaxDays) {
                retentionDays = rule.dataRetentionMaxDays;
            }
        }
        
        return retentionDays;
    }

    getMaxRetentionPeriod(rules) {
        let maxRetention = Infinity;
        
        for (const rule of rules) {
            if (rule.dataRetentionMaxDays && rule.dataRetentionMaxDays < maxRetention) {
                maxRetention = rule.dataRetentionMaxDays;
            }
        }
        
        return maxRetention === Infinity ? this.config.dataRetentionDays : maxRetention;
    }

    applyDataMinimization(data, purpose) {
        // Remove fields not necessary for the specified purpose
        const allowedFields = this.getAllowedFieldsForPurpose(purpose);
        
        const minimizeObject = (obj) => {
            const minimized = {};
            
            for (const [key, value] of Object.entries(obj)) {
                if (allowedFields.includes(key)) {
                    if (typeof value === 'object' && value !== null) {
                        minimized[key] = minimizeObject(value);
                    } else {
                        minimized[key] = value;
                    }
                }
            }
            
            return minimized;
        };
        
        return minimizeObject(data);
    }

    getAllowedFieldsForPurpose(purpose) {
        const fieldMappings = {
            'user_registration': ['name', 'email', 'phone', 'preferences'],
            'account_management': ['id', 'name', 'email', 'status', 'last_login'],
            'communication': ['email', 'name', 'message_history'],
            'payment_processing': ['payment_method', 'billing_address', 'transaction_id'],
            'analytics': ['user_id', 'session_data', 'interaction_events'],
            'system_operation': ['id', 'timestamp', 'status', 'performance_metrics'],
            'security': ['id', 'ip_address', 'user_agent', 'authentication_logs']
        };
        
        return fieldMappings[purpose] || Object.keys(data);
    }

    async encryptSensitiveFields(data) {
        if (!this.containsSensitiveInformation(data)) {
            return data;
        }

        const sensitiveFields = ['name', 'email', 'phone', 'address', 'ssn', 'credit_card'];
        
        const encryptObject = async (obj) => {
            const encrypted = {};
            
            for (const [key, value] of Object.entries(obj)) {
                if (sensitiveFields.includes(key) && typeof value === 'string') {
                    encrypted[key] = await this.encryptField(value, key);
                } else if (typeof value === 'object' && value !== null) {
                    encrypted[key] = await encryptObject(value);
                } else {
                    encrypted[key] = value;
                }
            }
            
            return encrypted;
        };
        
        return await encryptObject(data);
    }

    containsSensitiveInformation(data) {
        return this.containsPII(data) || this.containsSensitiveData(data) || 
               this.containsHealthData(data) || this.containsFinancialData(data);
    }

    async encryptField(value, fieldName) {
        const iv = crypto.randomBytes(16);
        const key = await this.deriveFieldKey(fieldName);
        
        const cipher = crypto.createCipher(this.config.encryptionAlgorithm, key);
        let encrypted = cipher.update(value, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        return {
            encrypted: true,
            data: encrypted,
            iv: iv.toString('hex'),
            algorithm: this.config.encryptionAlgorithm
        };
    }

    async decryptField(encryptedData) {
        if (!encryptedData.encrypted) return encryptedData;
        
        const key = await this.deriveFieldKey(encryptedData.fieldName);
        const decipher = crypto.createDecipher(encryptedData.algorithm, key);
        
        let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    }

    async deriveFieldKey(fieldName) {
        const keyMaterial = Buffer.concat([
            this.masterKey,
            Buffer.from(fieldName, 'utf8')
        ]);
        
        return crypto.createHash('sha256').update(keyMaterial).digest();
    }

    async logDataProcessing(processingInfo) {
        if (!this.config.auditLogging) return;
        
        const logEntry = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            dataSubject: this.hashDataSubject(processingInfo.dataSubject),
            dataTypes: processingInfo.dataTypes,
            purpose: processingInfo.purpose,
            legalBasis: processingInfo.legalBasis,
            jurisdiction: processingInfo.jurisdiction,
            retentionPeriod: processingInfo.retention,
            processingLocation: process.env.PROCESSING_LOCATION || 'unknown'
        };
        
        this.dataProcessingLog.push(logEntry);
        
        // Keep only recent logs (for compliance with data minimization)
        if (this.dataProcessingLog.length > 100000) {
            this.dataProcessingLog = this.dataProcessingLog.slice(-90000);
        }
        
        this.auditTrail.push({
            action: 'data_processing_logged',
            timestamp: Date.now(),
            details: { logId: logEntry.id }
        });
    }

    hashDataSubject(dataSubject) {
        return crypto.createHash('sha256')
            .update(dataSubject + this.masterKey.toString('hex'))
            .digest('hex')
            .substring(0, 16); // Shortened for storage efficiency
    }

    async recordConsent(dataSubject, purpose, consentData) {
        if (!this.config.consentTracking) return;
        
        const consentKey = `${dataSubject}:${purpose}`;
        const consent = {
            dataSubject: this.hashDataSubject(dataSubject),
            purpose: purpose,
            granted: consentData.granted,
            timestamp: Date.now(),
            method: consentData.method || 'explicit',
            ipAddress: this.hashIP(consentData.ipAddress),
            userAgent: consentData.userAgent,
            withdrawn: false,
            withdrawnAt: null,
            consentString: consentData.consentString,
            version: consentData.version || '1.0'
        };
        
        this.consentRecords.set(consentKey, consent);
        
        this.auditTrail.push({
            action: 'consent_recorded',
            timestamp: Date.now(),
            details: { 
                dataSubject: consent.dataSubject, 
                purpose: purpose, 
                granted: consent.granted 
            }
        });
        
        logger.info('Consent recorded', { 
            purpose: purpose, 
            granted: consent.granted,
            method: consent.method 
        });
    }

    async withdrawConsent(dataSubject, purpose) {
        const consentKey = `${dataSubject}:${purpose}`;
        const consent = this.consentRecords.get(consentKey);
        
        if (consent) {
            consent.withdrawn = true;
            consent.withdrawnAt = Date.now();
            
            this.auditTrail.push({
                action: 'consent_withdrawn',
                timestamp: Date.now(),
                details: { 
                    dataSubject: consent.dataSubject, 
                    purpose: purpose 
                }
            });
            
            logger.info('Consent withdrawn', { 
                purpose: purpose,
                dataSubject: consent.dataSubject 
            });
        }
    }

    hashIP(ipAddress) {
        if (!ipAddress) return null;
        return crypto.createHash('sha256')
            .update(ipAddress + this.masterKey.toString('hex'))
            .digest('hex')
            .substring(0, 12);
    }

    async handleDataSubjectRequest(requestType, dataSubject, additionalInfo = {}) {
        const hashedDataSubject = this.hashDataSubject(dataSubject);
        
        this.auditTrail.push({
            action: `data_subject_request_${requestType}`,
            timestamp: Date.now(),
            details: { 
                dataSubject: hashedDataSubject,
                requestType: requestType 
            }
        });
        
        switch (requestType) {
            case 'access':
                return await this.handleAccessRequest(hashedDataSubject);
            case 'rectification':
                return await this.handleRectificationRequest(hashedDataSubject, additionalInfo);
            case 'erasure':
                return await this.handleErasureRequest(hashedDataSubject);
            case 'portability':
                return await this.handlePortabilityRequest(hashedDataSubject);
            case 'restriction':
                return await this.handleRestrictionRequest(hashedDataSubject);
            default:
                throw new Error(`Unsupported request type: ${requestType}`);
        }
    }

    async handleAccessRequest(hashedDataSubject) {
        // Find all processing activities for this data subject
        const processingActivities = this.dataProcessingLog.filter(
            log => log.dataSubject === hashedDataSubject
        );
        
        // Find consent records
        const consents = Array.from(this.consentRecords.values())
            .filter(consent => consent.dataSubject === hashedDataSubject);
        
        return {
            processingActivities: processingActivities,
            consents: consents,
            dataRetentionInfo: processingActivities.map(activity => ({
                purpose: activity.purpose,
                retentionPeriod: activity.retentionPeriod,
                expiryDate: new Date(activity.timestamp + activity.retentionPeriod * 24 * 60 * 60 * 1000)
            }))
        };
    }

    async handleErasureRequest(hashedDataSubject) {
        if (!this.config.rightToBeforgotten) {
            throw new ComplianceError('Right to erasure not supported in current configuration');
        }
        
        // Remove consent records
        const consentKeys = Array.from(this.consentRecords.keys())
            .filter(key => this.consentRecords.get(key).dataSubject === hashedDataSubject);
        
        consentKeys.forEach(key => this.consentRecords.delete(key));
        
        // Mark processing logs for erasure (keeping minimal audit trail)
        this.dataProcessingLog.forEach(log => {
            if (log.dataSubject === hashedDataSubject) {
                log.erased = true;
                log.erasureDate = Date.now();
                delete log.dataTypes;
            }
        });
        
        this.auditTrail.push({
            action: 'data_erased',
            timestamp: Date.now(),
            details: { 
                dataSubject: hashedDataSubject,
                itemsErased: consentKeys.length 
            }
        });
        
        logger.info('Data erasure completed', { 
            dataSubject: hashedDataSubject,
            consentRecords: consentKeys.length 
        });
        
        return { 
            success: true, 
            itemsErased: consentKeys.length,
            erasureDate: Date.now() 
        };
    }

    async handlePortabilityRequest(hashedDataSubject) {
        // Export data in structured format
        const userData = await this.handleAccessRequest(hashedDataSubject);
        
        return {
            format: 'JSON',
            data: userData,
            exportDate: Date.now(),
            dataSubject: hashedDataSubject
        };
    }

    async handleRectificationRequest(hashedDataSubject, updates) {
        // Implementation would depend on specific data storage
        this.auditTrail.push({
            action: 'data_rectified',
            timestamp: Date.now(),
            details: { 
                dataSubject: hashedDataSubject,
                fieldsUpdated: Object.keys(updates) 
            }
        });
        
        return { success: true, updatedFields: Object.keys(updates) };
    }

    async handleRestrictionRequest(hashedDataSubject) {
        // Mark data for restricted processing
        this.dataProcessingLog.forEach(log => {
            if (log.dataSubject === hashedDataSubject) {
                log.restricted = true;
                log.restrictionDate = Date.now();
            }
        });
        
        return { success: true, restrictionDate: Date.now() };
    }

    getComplianceReport() {
        const report = {
            timestamp: Date.now(),
            configuration: {
                enabledRegulations: [],
                dataRetentionDays: this.config.dataRetentionDays,
                quantumSafeCrypto: this.config.quantumSafeCrypto,
                auditLogging: this.config.auditLogging
            },
            statistics: {
                totalProcessingLogs: this.dataProcessingLog.length,
                totalConsentRecords: this.consentRecords.size,
                totalAuditEntries: this.auditTrail.length,
                dataSubjectRequests: this.auditTrail.filter(
                    entry => entry.action.startsWith('data_subject_request_')
                ).length
            },
            compliance: {
                dataRetentionCompliance: this.checkDataRetentionCompliance(),
                consentCompliance: this.checkConsentCompliance(),
                encryptionCompliance: this.checkEncryptionCompliance()
            }
        };
        
        if (this.config.enableGDPR) report.configuration.enabledRegulations.push('GDPR');
        if (this.config.enableCCPA) report.configuration.enabledRegulations.push('CCPA');
        if (this.config.enablePDPA) report.configuration.enabledRegulations.push('PDPA');
        if (this.config.enableLGPD) report.configuration.enabledRegulations.push('LGPD');
        
        return report;
    }

    checkDataRetentionCompliance() {
        const now = Date.now();
        const expiredLogs = this.dataProcessingLog.filter(log => {
            const expiryDate = log.timestamp + (log.retentionPeriod * 24 * 60 * 60 * 1000);
            return now > expiryDate && !log.erased;
        });
        
        return {
            compliant: expiredLogs.length === 0,
            expiredRecords: expiredLogs.length,
            totalRecords: this.dataProcessingLog.length
        };
    }

    checkConsentCompliance() {
        const now = Date.now();
        const expiredConsents = Array.from(this.consentRecords.values()).filter(consent => {
            const consentAge = now - consent.timestamp;
            const maxAge = 365 * 24 * 60 * 60 * 1000; // 1 year
            return consentAge > maxAge && !consent.withdrawn;
        });
        
        return {
            compliant: expiredConsents.length === 0,
            expiredConsents: expiredConsents.length,
            totalConsents: this.consentRecords.size
        };
    }

    checkEncryptionCompliance() {
        return {
            encryptionEnabled: this.config.encryptionAlgorithm !== null,
            quantumSafe: this.config.quantumSafeCrypto,
            algorithm: this.config.encryptionAlgorithm
        };
    }

    async performDataRetentionCleanup() {
        const now = Date.now();
        let cleanedCount = 0;
        
        // Clean expired processing logs
        this.dataProcessingLog = this.dataProcessingLog.filter(log => {
            const expiryDate = log.timestamp + (log.retentionPeriod * 24 * 60 * 60 * 1000);
            if (now > expiryDate) {
                cleanedCount++;
                return false;
            }
            return true;
        });
        
        // Clean expired consents
        for (const [key, consent] of this.consentRecords.entries()) {
            const consentAge = now - consent.timestamp;
            const maxAge = 365 * 24 * 60 * 60 * 1000; // 1 year
            if (consentAge > maxAge) {
                this.consentRecords.delete(key);
                cleanedCount++;
            }
        }
        
        if (cleanedCount > 0) {
            this.auditTrail.push({
                action: 'retention_cleanup',
                timestamp: now,
                details: { recordsCleaned: cleanedCount }
            });
            
            logger.info('Data retention cleanup completed', { recordsCleaned: cleanedCount });
        }
        
        return { recordsCleaned: cleanedCount };
    }
}

class ComplianceError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ComplianceError';
    }
}

module.exports = { QuantumCompliance, ComplianceError };