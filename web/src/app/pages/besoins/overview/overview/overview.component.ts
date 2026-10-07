import { DecimalPipe } from '@angular/common';
import { Component } from '@angular/core';

@Component({
  selector: 'app-overview',
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.scss',
  providers: [DecimalPipe]
})
export class OverviewComponent {

}
