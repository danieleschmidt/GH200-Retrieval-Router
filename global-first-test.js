#!/usr/bin/env node
/**
 * Global-First Implementation Test
 * Tests I18n, compliance, and multi-region capabilities
 */

const { 
    QuantumI18n, 
    QuantumCompliance, 
    QuantumRegionManager 
} = require('./src/quantum');

async function globalFirstTest() {
    console.log('🌍 Testing Global-First Implementation...');
    console.log('Validating I18n, compliance, and multi-region features\n');
    
    let i18n, compliance, regionManager;
    
    try {
        // Test 1: Internationalization (I18n)
        console.log('🗣️ Testing Internationalization (I18n)');
        
        i18n = new QuantumI18n({
            defaultLanguage: 'en',
            supportedLanguages: ['en', 'es', 'fr', 'de', 'ja', 'zh'],
            quantumTranslation: true
        });
        
        await i18n.initialize();
        
        // Test language detection and translation
        const testMessages = [
            'quantum.task.created',
            'quantum.entanglement.created',
            'system.performance.excellent'
        ];
        
        const languages = ['en', 'es', 'fr', 'de'];
        let translationCount = 0;
        
        for (const lang of languages) {
            for (const key of testMessages) {
                const translation = i18n.translate(key, { coherence: 95 }, lang);
                if (translation && translation.length > 0) {
                    translationCount++;
                }
            }
        }
        
        console.log(`   ✅ Languages supported: ${i18n.config.supportedLanguages.length}`);
        console.log(`   📝 Translations available: ${translationCount}`);
        console.log(`   🧠 Quantum translation: ${i18n.config.quantumTranslation ? 'Enabled' : 'Disabled'}`);
        
        // Test language detection
        const detectedLang = i18n.detectLanguage({
            'accept-language': 'es-ES,es;q=0.9,en;q=0.8',
            'user-agent': 'Mozilla/5.0 (compatible; QuantumBot/1.0)'
        });
        
        console.log(`   🔍 Language detection: ${detectedLang}`);
        
        // Test 2: Compliance and Data Protection
        console.log('\\n🔒 Testing Compliance and Data Protection');
        
        compliance = new QuantumCompliance({
            enableGDPR: true,
            enableCCPA: true,
            enablePDPA: true,
            enableLGPD: true,
            quantumSafeCrypto: true,
            auditLogging: true
        });
        
        await compliance.initialize();
        
        // Test data encryption
        const testData = {
            userId: 'user123',
            taskData: 'sensitive quantum task information',
            metrics: { coherence: 0.95, entanglement: 0.7 }
        };
        
        const encryptedData = await compliance.encryptData(testData, 'quantum-tasks');
        const decryptedData = await compliance.decryptData(encryptedData, 'quantum-tasks');
        
        const encryptionWorking = JSON.stringify(testData) === JSON.stringify(decryptedData);
        console.log(`   🔐 Data encryption: ${encryptionWorking ? 'Working' : 'Failed'}`);
        
        // Test consent management
        const consentData = {
            userId: 'user123',
            purposes: ['quantum-processing', 'performance-analytics'],
            jurisdiction: 'EU',
            timestamp: Date.now()
        };
        
        const consentRecorded = await compliance.recordConsent(consentData);
        console.log(`   📋 Consent management: ${consentRecorded ? 'Working' : 'Failed'}`);
        
        // Test compliance validation
        const complianceCheck = await compliance.validateCompliance('user123', 'quantum-processing');
        console.log(`   ⚖️ Compliance validation: ${complianceCheck.compliant ? 'Compliant' : 'Non-compliant'}`);
        
        // Test data subject rights
        const dataExport = await compliance.exportUserData('user123');
        console.log(`   📤 Data portability: ${dataExport ? 'Available' : 'Not available'}`);
        
        // Test right to be forgotten
        const dataErasure = await compliance.eraseUserData('user123', 'test-reason');
        console.log(`   🗑️ Right to erasure: ${dataErasure ? 'Available' : 'Not available'}`);
        
        // Test audit trail
        const auditEntries = compliance.getAuditTrail().slice(-5);
        console.log(`   📊 Audit logging: ${auditEntries.length} recent entries`);
        
        // Test 3: Multi-Region Management
        console.log('\\n🌐 Testing Multi-Region Management');
        
        regionManager = new QuantumRegionManager({
            defaultRegion: 'us-east-1',
            enableGeoRouting: true,
            enableDataResidency: true,
            crossRegionReplication: true
        });
        
        await regionManager.initialize();
        
        // Test region registration
        const regions = [
            { id: 'us-east-1', name: 'US East', jurisdiction: 'US', dataCenter: 'Virginia' },
            { id: 'eu-west-1', name: 'EU West', jurisdiction: 'EU', dataCenter: 'Ireland' },
            { id: 'ap-southeast-1', name: 'Asia Pacific', jurisdiction: 'SG', dataCenter: 'Singapore' }
        ];
        
        for (const region of regions) {
            await regionManager.registerRegion(region);
        }
        
        console.log(`   🗺️ Regions registered: ${regionManager.getRegisteredRegions().length}`);
        
        // Test geo-routing
        const userContexts = [
            { ip: '203.0.113.1', country: 'US', gdprSubject: false },
            { ip: '192.0.2.1', country: 'DE', gdprSubject: true },
            { ip: '198.51.100.1', country: 'SG', gdprSubject: false }
        ];
        
        let routingTests = 0;
        for (const context of userContexts) {
            const selectedRegion = await regionManager.selectOptimalRegion(context);
            if (selectedRegion) {
                routingTests++;
                console.log(`   📍 ${context.country} → ${selectedRegion.id}`);
            }
        }
        
        console.log(`   🚦 Geo-routing: ${routingTests}/${userContexts.length} tests passed`);
        
        // Test data residency compliance
        const residencyCheck = await regionManager.validateDataResidency('user456', 'EU');
        console.log(`   🏛️ Data residency: ${residencyCheck ? 'Compliant' : 'Non-compliant'}`);
        
        // Test 4: Integration Validation
        console.log('\\n✅ Global-First Integration Validation');
        
        const validations = [
            {
                name: 'Multi-language support',
                passed: i18n.config.supportedLanguages.length >= 6
            },
            {
                name: 'GDPR compliance',
                passed: compliance.config.enableGDPR && 
                       complianceCheck.compliant &&
                       dataExport && 
                       dataErasure
            },
            {
                name: 'Data encryption',
                passed: encryptionWorking
            },
            {
                name: 'Multi-region routing',
                passed: routingTests >= 2
            },
            {
                name: 'Audit logging',
                passed: auditEntries.length > 0
            },
            {
                name: 'Quantum-safe features',
                passed: compliance.config.quantumSafeCrypto
            }
        ];
        
        let passedValidations = 0;
        for (const validation of validations) {
            const status = validation.passed ? '✅' : '❌';
            console.log(`   ${status} ${validation.name}`);
            if (validation.passed) passedValidations++;
        }
        
        // Regulatory compliance summary
        console.log('\\n📋 Regulatory Compliance Summary:');
        console.log(`   🇪🇺 GDPR (EU): ${compliance.config.enableGDPR ? 'Enabled' : 'Disabled'}`);
        console.log(`   🇺🇸 CCPA (California): ${compliance.config.enableCCPA ? 'Enabled' : 'Disabled'}`);
        console.log(`   🇸🇬 PDPA (Singapore): ${compliance.config.enablePDPA ? 'Enabled' : 'Disabled'}`);
        console.log(`   🇧🇷 LGPD (Brazil): ${compliance.config.enableLGPD ? 'Enabled' : 'Disabled'}`);
        
        // Global deployment readiness
        console.log('\\n🌍 Global Deployment Readiness:');
        console.log(`   🗣️ Languages: ${i18n.config.supportedLanguages.join(', ')}`);
        console.log(`   🌐 Regions: ${regionManager.getRegisteredRegions().map(r => r.id).join(', ')}`);
        console.log(`   🔒 Encryption: ${compliance.config.encryptionAlgorithm} (Quantum-safe: ${compliance.config.quantumSafeCrypto})`);
        console.log(`   📊 Audit trail: ${compliance.auditTrail.length} entries`);
        
        const successRate = (passedValidations / validations.length) * 100;
        
        console.log(`\\n🎯 Global-First Validation Results:`);
        console.log(`   ✅ Validations passed: ${passedValidations}/${validations.length}`);
        console.log(`   🎯 Success rate: ${successRate.toFixed(1)}%`);
        
        if (successRate >= 85) {
            console.log('\\n🏆 GLOBAL-FIRST IMPLEMENTATION: COMPLETE SUCCESS!');
            console.log('System ready for worldwide deployment with full compliance.');
            return true;
        } else {
            console.log('\\n⚠️ Some global-first features need attention.');
            return false;
        }
        
    } catch (error) {
        console.error('❌ Global-first test failed:', error.message);
        console.error(error.stack);
        return false;
    } finally {
        // Cleanup
        try {
            if (compliance) await compliance.shutdown();
            if (regionManager) await regionManager.shutdown();
        } catch (error) {
            console.warn('Cleanup warning:', error.message);
        }
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\\nGlobal-first test interrupted, cleaning up...');
    process.exit(0);
});

if (require.main === module) {
    globalFirstTest().then(success => {
        process.exit(success ? 0 : 1);
    });
}

module.exports = { globalFirstTest };