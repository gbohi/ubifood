import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RetraitCommandeComponent } from './retrait-commande.component';

describe('RetraitCommandeComponent', () => {
  let component: RetraitCommandeComponent;
  let fixture: ComponentFixture<RetraitCommandeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RetraitCommandeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RetraitCommandeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
