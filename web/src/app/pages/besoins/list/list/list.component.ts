import { DecimalPipe } from '@angular/common';
import { Component } from '@angular/core';

@Component({
  selector: 'app-list',
  templateUrl: './list.component.html',
  styleUrl: './list.component.scss',
  providers: [DecimalPipe]
})
export class ListComponent {
  
}
