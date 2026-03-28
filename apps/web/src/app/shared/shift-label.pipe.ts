import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'shiftLabel',
  standalone: true,
})
export class ShiftLabelPipe implements PipeTransform {
  transform(value?: string | null): string {
    if (!value) {
      return '';
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === 'manha') {
      return 'Manhã';
    }
    if (normalized === 'tarde') {
      return 'Tarde';
    }
    if (normalized === 'integral') {
      return 'Integral';
    }
    if (normalized === 'manha e tarde') {
      return 'Manhã e tarde';
    }
    return value;
  }
}
