import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';

type ConfirmOptions = {
  title: string;
  text?: string;
  confirmText?: string;
  cancelText?: string;
};

const baseConfig = {
  backdrop: 'rgba(15, 23, 42, 0.55)',
  heightAuto: false,
  scrollbarPadding: false,
  customClass: {
    container: '!z-[2200]',
    popup: 'rounded-2xl border border-outline-variant/25 bg-surface shadow-2xl',
    title: 'text-slate-900 font-bold text-xl',
    htmlContainer: 'text-slate-600 text-sm',
    confirmButton: 'rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary',
    cancelButton: 'rounded-lg border border-outline-variant/30 bg-surface px-4 py-2 text-sm font-semibold text-on-surface'
  },
  buttonsStyling: false,
  reverseButtons: true
} as const;

const MAX_ERROR_LENGTH = 160;

function sanitizeErrorText(text?: string): string | undefined {
  if (!text) {
    return undefined;
  }

  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return undefined;
  }

  if (normalized.length > MAX_ERROR_LENGTH) {
    return 'Ocurrio un problema temporal. Intenta nuevamente.';
  }

  const lower = normalized.toLowerCase();
  if (
    lower.includes('exception') ||
    lower.includes('stack') ||
    lower.includes('traceback') ||
    lower.includes('<html')
  ) {
    return 'Ocurrio un problema temporal. Intenta nuevamente.';
  }

  return normalized;
}

export async function confirmAction(options: ConfirmOptions): Promise<boolean> {
  const result = await Swal.fire({
    ...baseConfig,
    icon: 'question',
    title: options.title,
    text: options.text,
    showCancelButton: true,
    confirmButtonText: options.confirmText || 'Confirmar',
    cancelButtonText: options.cancelText || 'Cancelar'
  });

  return Boolean(result.isConfirmed);
}

export async function showSuccess(title: string, text?: string): Promise<void> {
  await Swal.fire({
    ...baseConfig,
    icon: 'success',
    title,
    text,
    confirmButtonText: 'Aceptar'
  });
}

export async function showError(title: string, text?: string): Promise<void> {
  await Swal.fire({
    ...baseConfig,
    icon: 'error',
    title,
    text: sanitizeErrorText(text),
    confirmButtonText: 'Entendido'
  });
}
