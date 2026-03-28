import { Component } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgFor, NgIf],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  sidebarOpen = false;
  readonly navItems: Array<{
    label: string;
    path?: string;
    children?: Array<{ label: string; path: string }>;
  }> = [
    { label: 'Dashboard', path: '/dashboard' },
    {
      label: 'Cadastros',
      children: [
        { label: 'Escola', path: '/escolas' },
        { label: 'Aluno', path: '/alunos' },
        { label: 'Veículos', path: '/veiculos' },
      ],
    },
    { label: 'Rotas', path: '/rotas' },
  ];

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }

  closeSidebar(): void {
    this.sidebarOpen = false;
  }
}
