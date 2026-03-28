import { Pipe, PipeTransform } from '@angular/core';

const STATUS_LABELS: Record<string, string> = {
  disponivel: 'Disponível',
  manutencao: 'Manutenção',
  revisao: 'Revisão',
  critico: 'Crítico',
};

@Pipe({
  name: 'statusLabel',
  standalone: true,
})
export class StatusLabelPipe implements PipeTransform {
  transform(value?: string | null): string {
    if (!value) {
      return '';
    }
    const trimmed = value.toString().trim();
    const normalized = trimmed
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    return STATUS_LABELS[normalized] ?? trimmed;
  }
}
