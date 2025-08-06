/**
 * AlertManager - Intelligent alerting system for GH200 Retrieval Router
 * Monitors system health and sends alerts based on configurable thresholds
 */

const EventEmitter = require('events');
const { logger } = require('../utils/logger');

/**
 * Alert severity levels
 */
const SEVERITY = {
    INFO: 'info',
    WARNING: 'warning',
    ERROR: 'error',
    CRITICAL: 'critical'
};

/**
 * Alert types
 */
const ALERT_TYPES = {
    HIGH_LATENCY: 'high_latency',
    ERROR_RATE: 'error_rate',
    MEMORY_USAGE: 'memory_usage',
    CIRCUIT_BREAKER: 'circuit_breaker',
    RATE_LIMIT: 'rate_limit',
    HEALTH_CHECK: 'health_check',
    PERFORMANCE: 'performance'
};

class Alert {
    constructor(type, severity, message, metadata = {}) {
        this.id = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.type = type;
        this.severity = severity;
        this.message = message;
        this.metadata = metadata;
        this.timestamp = new Date().toISOString();
        this.acknowledged = false;
        this.resolved = false;
        this.resolvedAt = null;
    }
    
    /**
     * Acknowledge the alert
     * @param {string} acknowledgedBy - Who acknowledged the alert
     */
    acknowledge(acknowledgedBy = 'system') {
        this.acknowledged = true;
        this.acknowledgedBy = acknowledgedBy;
        this.acknowledgedAt = new Date().toISOString();
    }
    
    /**
     * Resolve the alert
     * @param {string} resolvedBy - Who resolved the alert
     * @param {string} resolution - Resolution description
     */
    resolve(resolvedBy = 'system', resolution = 'Auto-resolved') {
        this.resolved = true;
        this.resolvedBy = resolvedBy;
        this.resolvedAt = new Date().toISOString();
        this.resolution = resolution;
    }
    
    /**
     * Get alert age in milliseconds
     */
    getAge() {
        return Date.now() - new Date(this.timestamp).getTime();
    }
    
    /**
     * Check if alert is stale (older than threshold)
     * @param {number} threshold - Threshold in milliseconds
     */
    isStale(threshold = 3600000) { // 1 hour default
        return this.getAge() > threshold;
    }
}

/**
 * Alert Rule Configuration
 */
class AlertRule {
    constructor(config) {
        this.name = config.name;
        this.type = config.type;
        this.severity = config.severity;
        this.condition = config.condition; // Function that returns boolean
        this.threshold = config.threshold;
        this.window = config.window || 300000; // 5 minutes default
        this.cooldown = config.cooldown || 900000; // 15 minutes default
        this.enabled = config.enabled !== false;
        this.lastTriggered = null;
        this.triggerCount = 0;
    }
    
    /**
     * Check if rule should trigger
     * @param {*} value - Value to check
     * @returns {boolean} Whether rule should trigger
     */
    shouldTrigger(value) {
        if (!this.enabled) {
            return false;
        }
        
        // Check cooldown period
        if (this.lastTriggered && (Date.now() - this.lastTriggered) < this.cooldown) {
            return false;
        }
        
        return this.condition(value, this.threshold);
    }
    
    /**
     * Trigger the rule
     */
    trigger() {
        this.lastTriggered = Date.now();
        this.triggerCount++;
    }
    
    /**
     * Get rule status
     */
    getStatus() {
        return {
            name: this.name,
            type: this.type,
            severity: this.severity,
            enabled: this.enabled,
            triggerCount: this.triggerCount,
            lastTriggered: this.lastTriggered,
            inCooldown: this.lastTriggered && (Date.now() - this.lastTriggered) < this.cooldown
        };
    }
}

class AlertManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            maxAlerts: 1000,
            alertTTL: 86400000, // 24 hours
            cleanupInterval: 3600000, // 1 hour
            ...options
        };
        
        this.alerts = new Map();
        this.rules = new Map();
        this.channels = new Map();
        
        // Initialize default rules
        this._initializeDefaultRules();
        
        // Start cleanup interval
        this._startCleanup();
        
        logger.info('AlertManager initialized', {
            maxAlerts: this.options.maxAlerts,
            alertTTL: this.options.alertTTL
        });
    }
    
    /**
     * Create and trigger an alert
     * @param {string} type - Alert type
     * @param {string} severity - Alert severity
     * @param {string} message - Alert message
     * @param {Object} metadata - Additional metadata
     * @returns {Alert} Created alert
     */
    createAlert(type, severity, message, metadata = {}) {
        const alert = new Alert(type, severity, message, metadata);
        
        this.alerts.set(alert.id, alert);
        
        // Remove oldest alerts if we exceed max limit
        if (this.alerts.size > this.options.maxAlerts) {
            const oldestAlert = Array.from(this.alerts.values())
                .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))[0];
            this.alerts.delete(oldestAlert.id);
        }
        
        this.emit('alertCreated', alert);
        
        logger.warn('Alert created', {
            alertId: alert.id,
            type: alert.type,
            severity: alert.severity,
            message: alert.message
        });
        
        // Send to notification channels
        this._sendToChannels(alert);
        
        return alert;
    }
    
    /**
     * Add alert rule
     * @param {Object} ruleConfig - Rule configuration
     */
    addRule(ruleConfig) {
        const rule = new AlertRule(ruleConfig);
        this.rules.set(rule.name, rule);
        
        logger.info('Alert rule added', {
            name: rule.name,
            type: rule.type,
            severity: rule.severity
        });
    }
    
    /**
     * Check value against all rules
     * @param {string} metricType - Type of metric
     * @param {*} value - Value to check
     * @param {Object} metadata - Additional context
     */
    checkRules(metricType, value, metadata = {}) {
        for (const rule of this.rules.values()) {
            if (rule.type === metricType && rule.shouldTrigger(value)) {
                rule.trigger();
                
                this.createAlert(
                    rule.type,
                    rule.severity,
                    `${rule.name}: Threshold exceeded`,
                    {
                        ...metadata,
                        value,
                        threshold: rule.threshold,
                        ruleName: rule.name
                    }
                );
            }
        }
    }
    
    /**
     * Add notification channel
     * @param {string} name - Channel name
     * @param {Function} handler - Notification handler function
     */
    addChannel(name, handler) {
        this.channels.set(name, handler);
        logger.info('Notification channel added', { name });
    }
    
    /**
     * Get alert by ID
     * @param {string} alertId - Alert ID
     * @returns {Alert|null} Alert or null if not found
     */
    getAlert(alertId) {
        return this.alerts.get(alertId) || null;
    }
    
    /**
     * Get alerts with optional filtering
     * @param {Object} filter - Filter criteria
     * @returns {Array<Alert>} Filtered alerts
     */
    getAlerts(filter = {}) {
        let alerts = Array.from(this.alerts.values());
        
        if (filter.type) {
            alerts = alerts.filter(alert => alert.type === filter.type);
        }
        
        if (filter.severity) {
            alerts = alerts.filter(alert => alert.severity === filter.severity);
        }
        
        if (filter.unresolved) {
            alerts = alerts.filter(alert => !alert.resolved);
        }
        
        if (filter.unacknowledged) {
            alerts = alerts.filter(alert => !alert.acknowledged);
        }
        
        return alerts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }
    
    /**
     * Acknowledge alert
     * @param {string} alertId - Alert ID
     * @param {string} acknowledgedBy - Who acknowledged
     */
    acknowledgeAlert(alertId, acknowledgedBy = 'system') {
        const alert = this.alerts.get(alertId);
        if (alert && !alert.acknowledged) {
            alert.acknowledge(acknowledgedBy);
            this.emit('alertAcknowledged', alert);
            
            logger.info('Alert acknowledged', {
                alertId,
                acknowledgedBy
            });
        }
    }
    
    /**
     * Resolve alert
     * @param {string} alertId - Alert ID
     * @param {string} resolvedBy - Who resolved
     * @param {string} resolution - Resolution description
     */
    resolveAlert(alertId, resolvedBy = 'system', resolution = 'Auto-resolved') {
        const alert = this.alerts.get(alertId);
        if (alert && !alert.resolved) {
            alert.resolve(resolvedBy, resolution);
            this.emit('alertResolved', alert);
            
            logger.info('Alert resolved', {
                alertId,
                resolvedBy,
                resolution
            });
        }
    }
    
    /**
     * Get alert statistics
     */
    getStats() {
        const alerts = Array.from(this.alerts.values());
        
        const stats = {
            total: alerts.length,
            unresolved: alerts.filter(a => !a.resolved).length,
            unacknowledged: alerts.filter(a => !a.acknowledged).length,
            bySeverity: {},
            byType: {},
            rules: this.rules.size,
            channels: this.channels.size
        };
        
        // Count by severity
        Object.values(SEVERITY).forEach(severity => {
            stats.bySeverity[severity] = alerts.filter(a => a.severity === severity).length;
        });
        
        // Count by type
        Object.values(ALERT_TYPES).forEach(type => {
            stats.byType[type] = alerts.filter(a => a.type === type).length;
        });
        
        return stats;
    }
    
    /**
     * Initialize default alert rules
     */
    _initializeDefaultRules() {
        // High latency rule
        this.addRule({
            name: 'High Query Latency',
            type: ALERT_TYPES.HIGH_LATENCY,
            severity: SEVERITY.WARNING,
            threshold: 5000, // 5 seconds
            condition: (value, threshold) => value > threshold,
            cooldown: 300000 // 5 minutes
        });
        
        // Error rate rule
        this.addRule({
            name: 'High Error Rate',
            type: ALERT_TYPES.ERROR_RATE,
            severity: SEVERITY.ERROR,
            threshold: 0.05, // 5%
            condition: (value, threshold) => value > threshold,
            cooldown: 600000 // 10 minutes
        });
        
        // Memory usage rule
        this.addRule({
            name: 'High Memory Usage',
            type: ALERT_TYPES.MEMORY_USAGE,
            severity: SEVERITY.WARNING,
            threshold: 0.9, // 90%
            condition: (value, threshold) => value > threshold,
            cooldown: 1800000 // 30 minutes
        });
        
        // Critical memory usage rule
        this.addRule({
            name: 'Critical Memory Usage',
            type: ALERT_TYPES.MEMORY_USAGE,
            severity: SEVERITY.CRITICAL,
            threshold: 0.95, // 95%
            condition: (value, threshold) => value > threshold,
            cooldown: 300000 // 5 minutes
        });
    }
    
    /**
     * Send alert to notification channels
     * @param {Alert} alert - Alert to send
     */
    _sendToChannels(alert) {
        for (const [name, handler] of this.channels) {
            try {
                handler(alert);
            } catch (error) {
                logger.error('Failed to send alert to channel', {
                    channel: name,
                    alertId: alert.id,
                    error: error.message
                });
            }
        }
    }
    
    /**
     * Start cleanup process
     */
    _startCleanup() {
        setInterval(() => {
            this._cleanup();
        }, this.options.cleanupInterval);
    }
    
    /**
     * Clean up old alerts
     */
    _cleanup() {
        const now = Date.now();
        const alertsToDelete = [];
        
        for (const [alertId, alert] of this.alerts) {
            if (alert.resolved && (now - new Date(alert.resolvedAt).getTime()) > this.options.alertTTL) {
                alertsToDelete.push(alertId);
            } else if (!alert.resolved && alert.isStale(this.options.alertTTL)) {
                // Auto-resolve stale alerts
                alert.resolve('system', 'Auto-resolved due to age');
                alertsToDelete.push(alertId);
            }
        }
        
        alertsToDelete.forEach(alertId => {
            this.alerts.delete(alertId);
        });
        
        if (alertsToDelete.length > 0) {
            logger.info('Cleaned up old alerts', {
                removed: alertsToDelete.length,
                remaining: this.alerts.size
            });
        }
    }
}

module.exports = {
    AlertManager,
    Alert,
    AlertRule,
    SEVERITY,
    ALERT_TYPES
};