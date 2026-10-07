import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TypeplatComponent } from './typeplat.component';

describe('TypeplatComponent', () => {
  let component: TypeplatComponent;
  let fixture: ComponentFixture<TypeplatComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TypeplatComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TypeplatComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
