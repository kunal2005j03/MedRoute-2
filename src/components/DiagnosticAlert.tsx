import { AlertCircle } from 'lucide-react';
import type { MapsApiDiagnostic } from '../types/medroute';

interface DiagnosticAlertProps {
  diagnostic: MapsApiDiagnostic;
  onSwitchToDemo?: () => void;
  title?: string;
}

const CATEGORY_LABELS: Record<MapsApiDiagnostic['category'], string> = {
  MISSING_API_KEY: 'Missing Server API Key',
  INVALID_API_KEY: 'Invalid API Key',
  BILLING_NOT_ENABLED: 'Billing Not Enabled',
  API_NOT_ENABLED: 'Google Maps API Not Enabled',
  API_RESTRICTION: 'API Key Restriction',
  QUOTA_EXCEEDED: 'API Quota Exceeded',
  INCORRECT_REQUEST: 'Invalid Request Parameters',
  NETWORK_FAILURE: 'Network Error',
  INCOMPLETE_RESPONSE: 'Incomplete API Response',
  AUTH_FAILURE: 'Authorization Failure',
  UNKNOWN_ERROR: 'Service Error',
};

export function DiagnosticAlert({
  diagnostic,
  onSwitchToDemo,
  title,
}: DiagnosticAlertProps) {
  const metaParts: string[] = [CATEGORY_LABELS[diagnostic.category] || 'API Error'];
  if (diagnostic.httpStatus) {
    metaParts.push(`HTTP ${diagnostic.httpStatus}`);
  }
  if (diagnostic.googleStatus) {
    metaParts.push(diagnostic.googleStatus);
  }

  return (
    <div
      role="alert"
      className="bg-red-50/70 border border-red-200 rounded-lg p-4 space-y-2"
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0 space-y-1">
          <div className="text-sm font-semibold text-red-900">
            {title || 'Live Maps Service Diagnostic'}
          </div>
          <p className="text-xs font-mono text-red-800/90 tabular-nums">
            {metaParts.join(' · ')}
          </p>
          <p className="text-sm text-slate-800 leading-relaxed">
            {diagnostic.userMessage}
          </p>
          {diagnostic.details && (
            <p className="text-xs text-slate-600 break-words">
              Detail: {diagnostic.details}
            </p>
          )}
        </div>
      </div>
      {onSwitchToDemo && (
        <div className="pl-8 pt-1">
          <button
            type="button"
            onClick={onSwitchToDemo}
            className="px-3.5 py-1.5 text-xs font-medium text-[#0F2942] bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            Switch to Demo Mode
          </button>
        </div>
      )}
    </div>
  );
}
