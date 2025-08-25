#!/usr/bin/env node
/**
 * Deployment Readiness Check - Generation 4.0
 * Final validation before production deployment
 */

const fs = require('fs').promises;
const path = require('path');

async function checkDeploymentReadiness() {
    console.log('🎯 DEPLOYMENT READINESS CHECK - GENERATION 4.0');
    console.log('='.repeat(60));

    const checks = {
        infrastructure: {},
        codeQuality: {},
        security: {},
        performance: {},
        monitoring: {},
        documentation: {}
    };

    try {
        // Infrastructure Checks
        console.log('🏗️  Infrastructure Readiness...');
        checks.infrastructure.dockerfile = await fileExists('./Dockerfile');
        checks.infrastructure.dockerCompose = await fileExists('./docker-compose.yml');
        checks.infrastructure.kubernetes = await fileExists('./k8s/base/kustomization.yaml');
        checks.infrastructure.helm = await fileExists('./helm/gh200-retrieval-router/Chart.yaml');
        checks.infrastructure.terraform = await fileExists('./terraform/main.tf');
        checks.infrastructure.ansible = await fileExists('./ansible/playbooks/site.yml');

        // Code Quality Checks  
        console.log('📋 Code Quality Validation...');
        checks.codeQuality.packageJson = await fileExists('./package.json');
        checks.codeQuality.eslintConfig = await hasLintingConfig();
        checks.codeQuality.testSuite = await hasTestSuite();
        checks.codeQuality.generation4Systems = await hasGeneration4Systems();

        // Security Checks
        console.log('🛡️  Security Framework...');
        checks.security.rbac = await fileExists('./k8s/base/rbac.yaml');
        checks.security.networkPolicies = await fileExists('./security/policies/network-policy.yaml');
        checks.security.secrets = await fileExists('./k8s/base/secret.yaml');
        checks.security.compliance = await fileExists('./security/compliance/gdpr-compliance.yaml');

        // Performance Checks
        console.log('⚡ Performance Framework...');
        checks.performance.benchmarkScript = await fileExists('./scripts/benchmark.js');
        checks.performance.generation4Orchestrator = await fileExists('./src/generation4/index.js');
        checks.performance.quantumML = await fileExists('./src/generation4/QuantumMLOptimizer.js');
        checks.performance.productionEngine = await fileExists('./src/generation4/ProductionOptimizationEngine.js');

        // Monitoring Checks
        console.log('📊 Monitoring & Observability...');
        checks.monitoring.prometheus = await fileExists('./k8s/monitoring/prometheus.yaml');
        checks.monitoring.healthEndpoints = await hasHealthEndpoints();
        checks.monitoring.metricsEndpoints = await hasMetricsEndpoints();

        // Documentation Checks
        console.log('📚 Documentation Completeness...');
        checks.documentation.readme = await fileExists('./README.md');
        checks.documentation.finalReport = await fileExists('./AUTONOMOUS_SDLC_GENERATION4_FINAL_REPORT.md');
        checks.documentation.deployment = await fileExists('./DEPLOYMENT_GUIDE.md');
        checks.documentation.architecture = await fileExists('./ARCHITECTURE.md');

        // Calculate Readiness Score
        const allChecks = Object.values(checks).reduce((acc, category) => {
            return { ...acc, ...category };
        }, {});

        const totalChecks = Object.keys(allChecks).length;
        const passedChecks = Object.values(allChecks).filter(Boolean).length;
        const readinessScore = (passedChecks / totalChecks * 100).toFixed(1);

        // Display Results
        console.log('\n' + '='.repeat(60));
        console.log('📊 DEPLOYMENT READINESS ASSESSMENT');
        console.log('='.repeat(60));

        console.log('\n🏗️  Infrastructure:');
        displayCategory(checks.infrastructure);

        console.log('\n📋 Code Quality:');
        displayCategory(checks.codeQuality);

        console.log('\n🛡️  Security:');
        displayCategory(checks.security);

        console.log('\n⚡ Performance:');
        displayCategory(checks.performance);

        console.log('\n📊 Monitoring:');
        displayCategory(checks.monitoring);

        console.log('\n📚 Documentation:');
        displayCategory(checks.documentation);

        console.log('\n' + '='.repeat(60));
        console.log(`🎯 OVERALL READINESS SCORE: ${readinessScore}%`);
        console.log(`✅ Checks Passed: ${passedChecks}/${totalChecks}`);

        const isReady = readinessScore >= 90;
        console.log(`🚀 Deployment Status: ${isReady ? '✅ READY FOR PRODUCTION' : '⚠️  NEEDS ATTENTION'}`);

        if (isReady) {
            console.log('\n🎉 DEPLOYMENT APPROVED!');
            console.log('─'.repeat(30));
            console.log('Your GH200-Retrieval-Router is ready for production deployment.');
            console.log('');
            console.log('Quick Deployment Commands:');
            console.log('  Kubernetes: kubectl apply -k k8s/base/');
            console.log('  Helm:       helm install gh200-retrieval-router ./helm/gh200-retrieval-router/');
            console.log('  Docker:     docker-compose up -d');
            console.log('');
            console.log('Post-Deployment:');
            console.log('  Health:     curl http://your-domain.com/health');
            console.log('  Metrics:    curl http://your-domain.com/api/v1/metrics');
            console.log('  Dashboard:  https://grafana.your-domain.com');
        } else {
            console.log('\n⚠️  DEPLOYMENT REQUIRES ATTENTION');
            console.log('─'.repeat(40));
            console.log('Please address missing components before production deployment.');
            console.log('Focus on areas with the most missing checks for maximum impact.');
        }

        return {
            ready: isReady,
            score: readinessScore,
            checks: allChecks,
            passed: passedChecks,
            total: totalChecks
        };

    } catch (error) {
        console.error('❌ Readiness check failed:', error.message);
        return { ready: false, error: error.message };
    }
}

function displayCategory(category) {
    Object.entries(category).forEach(([check, passed]) => {
        console.log(`  ${passed ? '✅' : '❌'} ${check.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
    });
}

async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function hasLintingConfig() {
    const packageJsonPath = './package.json';
    try {
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
        return packageJson.scripts && packageJson.scripts['lint:fix'];
    } catch {
        return false;
    }
}

async function hasTestSuite() {
    const testDirExists = await fileExists('./tests');
    const packageJsonPath = './package.json';
    try {
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
        return testDirExists && packageJson.scripts && packageJson.scripts.test;
    } catch {
        return false;
    }
}

async function hasGeneration4Systems() {
    const systems = [
        './src/generation4/QuantumMLOptimizer.js',
        './src/generation4/AutonomousHealingSystem.js',
        './src/generation4/ResearchBenchmarkingSystem.js',
        './src/generation4/FederatedMultiClusterOrchestrator.js'
    ];

    const existenceChecks = await Promise.all(systems.map(fileExists));
    return existenceChecks.every(Boolean);
}

async function hasHealthEndpoints() {
    const routesPath = './src/routes/health.js';
    return await fileExists(routesPath);
}

async function hasMetricsEndpoints() {
    const routesPath = './src/routes/metrics.js';
    return await fileExists(routesPath);
}

// Execute if run directly
if (require.main === module) {
    checkDeploymentReadiness()
        .then(result => {
            process.exit(result.ready ? 0 : 1);
        })
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

module.exports = { checkDeploymentReadiness };