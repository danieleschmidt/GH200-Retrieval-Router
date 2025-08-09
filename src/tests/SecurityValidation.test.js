/**
 * Security Validation Tests
 * Comprehensive tests for security components
 */

const AdvancedSecurityValidator = require('../security/AdvancedSecurityValidator');
const ComplianceManager = require('../security/ComplianceManager');

describe('Security Validation', () => {
    let securityValidator;
    let complianceManager;

    beforeEach(() => {
        securityValidator = new AdvancedSecurityValidator({
            maxRequestSize: 1024 * 1024, // 1MB
            rateLimit: 10,
            enableThreatDetection: true,
            logSecurityEvents: false
        });

        complianceManager = new ComplianceManager({
            enableGDPR: true,
            enableCCPA: true,
            dataRetentionDays: 30,
            auditLogging: false
        });
    });

    describe('AdvancedSecurityValidator', () => {
        test('should validate clean requests', async () => {
            const mockReq = {
                ip: '127.0.0.1',
                get: jest.fn().mockReturnValue('Mozilla/5.0'),
                query: { search: 'test query' },
                body: { message: 'hello world' }
            };

            const result = await securityValidator.validateRequest(mockReq);
            
            expect(result.isValid).toBe(true);
            expect(result.riskLevel).toBe('low');
            expect(result.threats).toHaveLength(0);
        });

        test('should detect SQL injection attempts', async () => {
            const mockReq = {
                ip: '127.0.0.1',
                get: jest.fn().mockReturnValue('Mozilla/5.0'),
                query: { search: "'; DROP TABLE users; --" },
                body: {}
            };

            const result = await securityValidator.validateRequest(mockReq);
            
            expect(result.isValid).toBe(false);
            expect(result.riskLevel).toBe('high');
            expect(result.threats.some(t => t.type === 'sqlInjection')).toBe(true);
        });

        test('should detect XSS attempts', async () => {
            const mockReq = {
                ip: '127.0.0.1',
                get: jest.fn().mockReturnValue('Mozilla/5.0'),
                query: {},
                body: { content: '<script>alert("xss")</script>' }
            };

            const result = await securityValidator.validateRequest(mockReq);
            
            expect(result.isValid).toBe(false);
            expect(result.threats.some(t => t.type === 'xss')).toBe(true);
        });

        test('should enforce rate limits', async () => {
            const mockReq = {
                ip: '192.168.1.100',
                get: jest.fn().mockReturnValue('Mozilla/5.0'),
                query: {},
                body: {}
            };

            // Make requests up to the limit
            for (let i = 0; i < 10; i++) {
                await securityValidator.validateRequest(mockReq);
            }

            // This should exceed the rate limit
            const result = await securityValidator.validateRequest(mockReq);
            
            expect(result.isValid).toBe(false);
            expect(result.threats.some(t => t.type === 'rate_limit_exceeded')).toBe(true);
        });

        test('should provide security statistics', () => {
            const stats = securityValidator.getSecurityStats();
            
            expect(stats).toHaveProperty('suspiciousIPCount');
            expect(stats).toHaveProperty('rateLimitedIPs');
            expect(stats).toHaveProperty('threatPatternsActive');
            expect(stats).toHaveProperty('config');
        });
    });

    describe('ComplianceManager', () => {
        test('should record user consent', async () => {
            const consent = await complianceManager.recordConsent('user123', 'data_processing', {
                ipAddress: '127.0.0.1',
                userAgent: 'Mozilla/5.0',
                method: 'explicit'
            });

            expect(consent.userId).toBe('user123');
            expect(consent.purpose).toBe('data_processing');
            expect(consent.granted).toBe(true);
            expect(consent.method).toBe('explicit');
        });

        test('should validate consent', () => {
            // Record consent first
            complianceManager.recordConsent('user456', 'data_processing', {
                ipAddress: '127.0.0.1',
                userAgent: 'Mozilla/5.0'
            });

            const hasConsent = complianceManager.hasValidConsent('user456', 'data_processing');
            expect(hasConsent).toBe(true);

            const noConsent = complianceManager.hasValidConsent('user456', 'analytics');
            expect(noConsent).toBe(false);
        });

        test('should revoke consent', async () => {
            // Record consent first
            await complianceManager.recordConsent('user789', 'marketing', {
                ipAddress: '127.0.0.1',
                userAgent: 'Mozilla/5.0'
            });

            // Revoke consent
            const revokedConsent = await complianceManager.revokeConsent('user789', 'marketing');
            
            expect(revokedConsent.granted).toBe(false);
            expect(revokedConsent.revokedAt).toBeDefined();
        });

        test('should encrypt sensitive data', () => {
            const sensitiveData = {
                name: 'John Doe',
                email: 'john@example.com',
                phone: '555-1234',
                regularField: 'not sensitive'
            };

            const encrypted = complianceManager.encryptSensitiveData(sensitiveData);
            
            expect(encrypted.name).toBe('John Doe'); // name is not in sensitive fields
            expect(encrypted.email).toMatch(/^enc:/); // email should be encrypted
            expect(encrypted.phone).toMatch(/^enc:/); // phone should be encrypted
            expect(encrypted.regularField).toBe('not sensitive');
        });

        test('should handle GDPR data access request', async () => {
            const result = await complianceManager.processGDPRRequest('user123', 'access');
            
            expect(result).toHaveProperty('personalData');
            expect(result).toHaveProperty('consentHistory');
            expect(result).toHaveProperty('dataProcessingPurposes');
            expect(result).toHaveProperty('dataRetention');
        });

        test('should schedule data deletion', async () => {
            const dataEntry = await complianceManager.scheduleDataDeletion('user456', 'profile', 90);
            
            expect(dataEntry.userId).toBe('user456');
            expect(dataEntry.dataType).toBe('profile');
            expect(dataEntry.status).toBe('active');
            expect(dataEntry.scheduledDeletion).toBeDefined();
        });

        test('should provide compliance status', () => {
            const status = complianceManager.getComplianceStatus();
            
            expect(status.regulations.gdpr).toBe(true);
            expect(status.regulations.ccpa).toBe(true);
            expect(status).toHaveProperty('stats');
            expect(status).toHaveProperty('config');
        });
    });
});

module.exports = { AdvancedSecurityValidator, ComplianceManager };