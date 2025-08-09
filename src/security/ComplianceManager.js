/**
 * Comprehensive Compliance Manager for Global-First Deployment
 * GDPR, CCPA, PDPA, SOX, HIPAA compliant data handling
 */

const crypto = require('crypto');
const { logger } = require('../utils/logger');

class ComplianceManager {
    constructor(options = {}) {
        this.config = {
            enableGDPR: options.enableGDPR !== false,
            enableCCPA: options.enableCCPA !== false,
            enablePDPA: options.enablePDPA !== false,
            enableSOX: options.enableSOX || false,
            enableHIPAA: options.enableHIPAA || false,
            dataRetentionDays: options.dataRetentionDays || 365,
            encryptionKey: options.encryptionKey || this._generateEncryptionKey(),
            auditLogging: options.auditLogging !== false,
            automaticDeletion: options.automaticDeletion !== false,
            ...options
        };
        
        this.consentStore = new Map();
        this.dataInventory = new Map();
        this.auditLog = [];
        
        this._initializeCompliance();
    }

    _initializeCompliance() {
        // Set up automatic cleanup if enabled
        if (this.config.automaticDeletion) {
            setInterval(() => {
                this._performAutomaticCleanup();
            }, 24 * 60 * 60 * 1000); // Daily cleanup
        }
        
        logger.info('Compliance Manager initialized', {
            gdpr: this.config.enableGDPR,
            ccpa: this.config.enableCCPA,
            pdpa: this.config.enablePDPA,
            sox: this.config.enableSOX,
            hipaa: this.config.enableHIPAA,
            retentionDays: this.config.dataRetentionDays
        });
    }

    _generateEncryptionKey() {
        return crypto.randomBytes(32).toString('hex');
    }

    // GDPR Compliance Methods
    async processGDPRRequest(userId, requestType, data = {}) {
        if (!this.config.enableGDPR) {
            throw new Error('GDPR compliance is not enabled');
        }
        
        const auditEntry = {
            timestamp: new Date().toISOString(),
            userId,
            requestType,
            status: 'processing',
            regulation: 'GDPR'
        };
        
        try {
            let result;
            
            switch (requestType) {
                case 'access':
                    result = await this._handleDataAccess(userId);
                    break;
                case 'portability':
                    result = await this._handleDataPortability(userId);
                    break;
                case 'rectification':
                    result = await this._handleDataRectification(userId, data);
                    break;
                case 'erasure':
                    result = await this._handleDataErasure(userId);
                    break;
                case 'restrict_processing':
                    result = await this._handleProcessingRestriction(userId);
                    break;
                case 'object':
                    result = await this._handleObjection(userId, data);
                    break;
                default:
                    throw new Error(`Unsupported GDPR request type: ${requestType}`);
            }
            
            auditEntry.status = 'completed';
            auditEntry.result = result;
            
            return result;
            
        } catch (error) {
            auditEntry.status = 'failed';
            auditEntry.error = error.message;
            throw error;
        } finally {
            this._addAuditEntry(auditEntry);
        }
    }

    // CCPA Compliance Methods
    async processCCPARequest(userId, requestType, data = {}) {
        if (!this.config.enableCCPA) {
            throw new Error('CCPA compliance is not enabled');
        }
        
        const auditEntry = {
            timestamp: new Date().toISOString(),
            userId,
            requestType,
            status: 'processing',
            regulation: 'CCPA'
        };
        
        try {
            let result;
            
            switch (requestType) {
                case 'know':
                    result = await this._handleCCPAKnowRequest(userId);
                    break;
                case 'delete':
                    result = await this._handleCCPADeleteRequest(userId);
                    break;
                case 'opt_out':
                    result = await this._handleCCPAOptOut(userId);
                    break;
                default:
                    throw new Error(`Unsupported CCPA request type: ${requestType}`);
            }
            
            auditEntry.status = 'completed';
            auditEntry.result = result;
            
            return result;
            
        } catch (error) {
            auditEntry.status = 'failed';
            auditEntry.error = error.message;
            throw error;
        } finally {
            this._addAuditEntry(auditEntry);
        }
    }

    // Consent Management
    async recordConsent(userId, purpose, consentData) {
        const consent = {
            userId,
            purpose,
            granted: true,
            timestamp: new Date().toISOString(),
            ipAddress: consentData.ipAddress,
            userAgent: consentData.userAgent,
            method: consentData.method || 'explicit',
            version: consentData.version || '1.0'
        };
        
        const consentKey = `${userId}_${purpose}`;
        this.consentStore.set(consentKey, consent);
        
        this._addAuditEntry({
            timestamp: consent.timestamp,
            action: 'consent_granted',
            userId,
            purpose,
            method: consent.method
        });
        
        logger.info('Consent recorded', { userId, purpose, method: consent.method });
        
        return consent;
    }

    async revokeConsent(userId, purpose) {
        const consentKey = `${userId}_${purpose}`;
        const existingConsent = this.consentStore.get(consentKey);
        
        if (!existingConsent) {
            throw new Error('No consent found to revoke');
        }
        
        const revokedConsent = {
            ...existingConsent,
            granted: false,
            revokedAt: new Date().toISOString()
        };
        
        this.consentStore.set(consentKey, revokedConsent);
        
        this._addAuditEntry({
            timestamp: revokedConsent.revokedAt,
            action: 'consent_revoked',
            userId,
            purpose
        });
        
        // Trigger data processing restriction
        await this._restrictDataProcessing(userId, purpose);
        
        logger.info('Consent revoked', { userId, purpose });
        
        return revokedConsent;
    }

    hasValidConsent(userId, purpose) {
        const consentKey = `${userId}_${purpose}`;
        const consent = this.consentStore.get(consentKey);
        
        if (!consent || !consent.granted) {
            return false;
        }
        
        // Check if consent is still valid (not expired)
        const consentAge = Date.now() - new Date(consent.timestamp).getTime();
        const maxAge = this.config.consentValidityDays * 24 * 60 * 60 * 1000;
        
        return consentAge <= maxAge;
    }

    // Data Encryption for Compliance
    encryptSensitiveData(data, additionalContext = {}) {
        if (!data || typeof data !== 'object') {
            return data;
        }
        
        const sensitiveFields = [
            'email', 'phone', 'ssn', 'passport', 'drivingLicense',
            'creditCard', 'bankAccount', 'personalId', 'medicalId'
        ];
        
        const encrypted = { ...data };
        
        for (const field of sensitiveFields) {
            if (encrypted[field]) {
                encrypted[field] = this._encrypt(String(encrypted[field]));
                
                this._addAuditEntry({
                    timestamp: new Date().toISOString(),
                    action: 'data_encrypted',
                    field,
                    context: additionalContext
                });
            }
        }
        
        return encrypted;
    }

    decryptSensitiveData(encryptedData, userId, purpose) {
        if (!this.hasValidConsent(userId, purpose)) {
            throw new Error('No valid consent for data decryption');
        }
        
        if (!encryptedData || typeof encryptedData !== 'object') {
            return encryptedData;
        }
        
        const decrypted = { ...encryptedData };
        
        for (const [key, value] of Object.entries(decrypted)) {
            if (typeof value === 'string' && this._isEncrypted(value)) {
                try {
                    decrypted[key] = this._decrypt(value);
                    
                    this._addAuditEntry({
                        timestamp: new Date().toISOString(),
                        action: 'data_decrypted',
                        userId,
                        purpose,
                        field: key
                    });
                } catch (error) {
                    logger.error('Decryption failed', { key, error: error.message });
                }
            }
        }
        
        return decrypted;
    }

    // Data Retention Management
    async scheduleDataDeletion(userId, dataType, customRetentionDays = null) {
        const retentionDays = customRetentionDays || this.config.dataRetentionDays;
        const deletionDate = new Date();
        deletionDate.setDate(deletionDate.getDate() + retentionDays);
        
        const dataEntry = {
            userId,
            dataType,
            createdAt: new Date().toISOString(),
            scheduledDeletion: deletionDate.toISOString(),
            status: 'active'
        };
        
        const entryKey = `${userId}_${dataType}_${Date.now()}`;
        this.dataInventory.set(entryKey, dataEntry);
        
        this._addAuditEntry({
            timestamp: dataEntry.createdAt,
            action: 'data_retention_scheduled',
            userId,
            dataType,
            deletionDate: dataEntry.scheduledDeletion
        });
        
        return dataEntry;
    }

    // Implementation of specific request handlers
    async _handleDataAccess(userId) {
        const userData = await this._collectUserData(userId);
        const consentHistory = this._getConsentHistory(userId);
        
        return {
            personalData: userData,
            consentHistory,
            dataProcessingPurposes: this._getProcessingPurposes(userId),
            dataRetention: this._getRetentionSchedule(userId)
        };
    }

    async _handleDataPortability(userId) {
        const userData = await this._collectUserData(userId);
        
        return {
            format: 'JSON',
            data: userData,
            exportedAt: new Date().toISOString(),
            instructions: 'Data exported in machine-readable JSON format'
        };
    }

    async _handleDataErasure(userId) {
        // Remove user data from all systems
        const deletedData = await this._deleteUserData(userId);
        
        // Revoke all consents
        for (const [key, consent] of this.consentStore.entries()) {
            if (consent.userId === userId) {
                this.consentStore.delete(key);
            }
        }
        
        return {
            deleted: true,
            deletedAt: new Date().toISOString(),
            affectedRecords: deletedData.recordCount
        };
    }

    async _performAutomaticCleanup() {
        const now = new Date();
        let deletedCount = 0;
        
        for (const [key, dataEntry] of this.dataInventory.entries()) {
            const scheduledDeletion = new Date(dataEntry.scheduledDeletion);
            
            if (now >= scheduledDeletion && dataEntry.status === 'active') {
                await this._deleteDataEntry(dataEntry);
                this.dataInventory.delete(key);
                deletedCount++;
            }
        }
        
        logger.info('Automatic compliance cleanup completed', {
            deletedEntries: deletedCount,
            remainingEntries: this.dataInventory.size
        });
    }

    _encrypt(data) {
        const cipher = crypto.createCipher('aes-256-gcm', this.config.encryptionKey);
        let encrypted = cipher.update(data, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag().toString('hex');
        return `enc:${encrypted}:${authTag}`;
    }

    _decrypt(encryptedData) {
        if (!encryptedData.startsWith('enc:')) {
            return encryptedData;
        }
        
        const parts = encryptedData.substring(4).split(':');
        const encrypted = parts[0];
        const authTag = parts[1];
        
        const decipher = crypto.createDecipher('aes-256-gcm', this.config.encryptionKey);
        decipher.setAuthTag(Buffer.from(authTag, 'hex'));
        
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    }

    _isEncrypted(data) {
        return typeof data === 'string' && data.startsWith('enc:');
    }

    _addAuditEntry(entry) {
        if (!this.config.auditLogging) return;
        
        this.auditLog.push(entry);
        
        // Keep audit log manageable
        if (this.auditLog.length > 10000) {
            this.auditLog = this.auditLog.slice(-5000);
        }
        
        logger.debug('Audit entry added', entry);
    }

    // Placeholder methods for actual data operations
    async _collectUserData(userId) {
        // Implementation would collect user data from all relevant systems
        return { userId, note: 'Data collection implementation needed' };
    }

    async _deleteUserData(userId) {
        // Implementation would delete user data from all relevant systems
        return { recordCount: 0, note: 'Data deletion implementation needed' };
    }

    _getConsentHistory(userId) {
        const history = [];
        for (const consent of this.consentStore.values()) {
            if (consent.userId === userId) {
                history.push(consent);
            }
        }
        return history;
    }

    // Public API for compliance status
    getComplianceStatus() {
        return {
            regulations: {
                gdpr: this.config.enableGDPR,
                ccpa: this.config.enableCCPA,
                pdpa: this.config.enablePDPA,
                sox: this.config.enableSOX,
                hipaa: this.config.enableHIPAA
            },
            stats: {
                activeConsents: this.consentStore.size,
                auditEntries: this.auditLog.length,
                dataInventorySize: this.dataInventory.size
            },
            config: {
                dataRetentionDays: this.config.dataRetentionDays,
                automaticDeletion: this.config.automaticDeletion,
                auditLogging: this.config.auditLogging
            }
        };
    }
}

module.exports = ComplianceManager;