{{/*
Expand the name of the chart.
*/}}
{{- define "gh200-retrieval-router.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "gh200-retrieval-router.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "gh200-retrieval-router.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "gh200-retrieval-router.labels" -}}
helm.sh/chart: {{ include "gh200-retrieval-router.chart" . }}
{{ include "gh200-retrieval-router.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: gh200-system
{{- end }}

{{/*
Selector labels
*/}}
{{- define "gh200-retrieval-router.selectorLabels" -}}
app.kubernetes.io/name: {{ include "gh200-retrieval-router.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: application
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "gh200-retrieval-router.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "gh200-retrieval-router.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Generate the Docker image name
*/}}
{{- define "gh200-retrieval-router.image" -}}
{{- if .Values.global.imageRegistry }}
{{- printf "%s/%s:%s" .Values.global.imageRegistry .Values.image.repository .Values.image.tag }}
{{- else }}
{{- printf "%s/%s:%s" .Values.image.registry .Values.image.repository .Values.image.tag }}
{{- end }}
{{- end }}

{{/*
Generate pull secrets
*/}}
{{- define "gh200-retrieval-router.imagePullSecrets" -}}
{{- $pullSecrets := list }}
{{- if .Values.global.imagePullSecrets }}
{{- $pullSecrets = .Values.global.imagePullSecrets }}
{{- else if .Values.image.pullSecrets }}
{{- $pullSecrets = .Values.image.pullSecrets }}
{{- end }}
{{- if $pullSecrets }}
imagePullSecrets:
{{- range $pullSecrets }}
  - name: {{ . }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Generate storage class name
*/}}
{{- define "gh200-retrieval-router.storageClass" -}}
{{- if .Values.global.storageClass }}
{{- printf "%s" .Values.global.storageClass }}
{{- else if .Values.persistence.storageClass }}
{{- printf "%s" .Values.persistence.storageClass }}
{{- else }}
{{- printf "fast-ssd" }}
{{- end }}
{{- end }}

{{/*
Generate Redis connection string
*/}}
{{- define "gh200-retrieval-router.redisUrl" -}}
{{- if .Values.redis.enabled }}
{{- if .Values.redis.auth.enabled }}
{{- printf "redis://:%s@%s-redis-master:6379" .Values.redis.auth.password (include "gh200-retrieval-router.fullname" .) }}
{{- else }}
{{- printf "redis://%s-redis-master:6379" (include "gh200-retrieval-router.fullname" .) }}
{{- end }}
{{- else }}
{{- printf "redis://localhost:6379" }}
{{- end }}
{{- end }}

{{/*
Generate resource limits
*/}}
{{- define "gh200-retrieval-router.resources" -}}
{{- if .Values.resources }}
resources:
  {{- if .Values.resources.limits }}
  limits:
    {{- toYaml .Values.resources.limits | nindent 4 }}
  {{- end }}
  {{- if .Values.resources.requests }}
  requests:
    {{- toYaml .Values.resources.requests | nindent 4 }}
  {{- end }}
{{- end }}
{{- end }}

{{/*
Generate security context
*/}}
{{- define "gh200-retrieval-router.securityContext" -}}
securityContext:
  {{- toYaml .Values.securityContext | nindent 2 }}
{{- end }}

{{/*
Generate pod security context
*/}}
{{- define "gh200-retrieval-router.podSecurityContext" -}}
securityContext:
  runAsNonRoot: {{ .Values.securityContext.runAsNonRoot }}
  runAsUser: {{ .Values.securityContext.runAsUser }}
  runAsGroup: {{ .Values.securityContext.runAsGroup }}
  fsGroup: {{ .Values.securityContext.fsGroup }}
  seccompProfile:
    type: RuntimeDefault
{{- end }}

{{/*
Generate volume mounts
*/}}
{{- define "gh200-retrieval-router.volumeMounts" -}}
volumeMounts:
- name: config
  mountPath: /app/config
  readOnly: true
- name: data
  mountPath: /app/data
- name: logs
  mountPath: /app/logs
- name: tmp
  mountPath: /app/tmp
{{- end }}

{{/*
Generate volumes
*/}}
{{- define "gh200-retrieval-router.volumes" -}}
volumes:
- name: config
  configMap:
    name: {{ include "gh200-retrieval-router.fullname" . }}-config
- name: logs
  emptyDir:
    sizeLimit: 10Gi
- name: tmp
  emptyDir:
    sizeLimit: 10Gi
{{- end }}

{{/*
Generate liveness probe
*/}}
{{- define "gh200-retrieval-router.livenessProbe" -}}
{{- if .Values.healthcheck.livenessProbe.enabled }}
livenessProbe:
  httpGet:
    path: /health
    port: http
  initialDelaySeconds: {{ .Values.healthcheck.livenessProbe.initialDelaySeconds }}
  periodSeconds: {{ .Values.healthcheck.livenessProbe.periodSeconds }}
  timeoutSeconds: {{ .Values.healthcheck.livenessProbe.timeoutSeconds }}
  failureThreshold: {{ .Values.healthcheck.livenessProbe.failureThreshold }}
  successThreshold: {{ .Values.healthcheck.livenessProbe.successThreshold }}
{{- end }}
{{- end }}

{{/*
Generate readiness probe
*/}}
{{- define "gh200-retrieval-router.readinessProbe" -}}
{{- if .Values.healthcheck.readinessProbe.enabled }}
readinessProbe:
  httpGet:
    path: /health
    port: http
  initialDelaySeconds: {{ .Values.healthcheck.readinessProbe.initialDelaySeconds }}
  periodSeconds: {{ .Values.healthcheck.readinessProbe.periodSeconds }}
  timeoutSeconds: {{ .Values.healthcheck.readinessProbe.timeoutSeconds }}
  failureThreshold: {{ .Values.healthcheck.readinessProbe.failureThreshold }}
  successThreshold: {{ .Values.healthcheck.readinessProbe.successThreshold }}
{{- end }}
{{- end }}

{{/*
Generate startup probe
*/}}
{{- define "gh200-retrieval-router.startupProbe" -}}
{{- if .Values.healthcheck.startupProbe.enabled }}
startupProbe:
  httpGet:
    path: /ping
    port: http
  initialDelaySeconds: {{ .Values.healthcheck.startupProbe.initialDelaySeconds }}
  periodSeconds: {{ .Values.healthcheck.startupProbe.periodSeconds }}
  timeoutSeconds: {{ .Values.healthcheck.startupProbe.timeoutSeconds }}
  failureThreshold: {{ .Values.healthcheck.startupProbe.failureThreshold }}
  successThreshold: {{ .Values.healthcheck.startupProbe.successThreshold }}
{{- end }}
{{- end }}