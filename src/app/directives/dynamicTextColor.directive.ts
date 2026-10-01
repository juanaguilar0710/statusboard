import { Directive, ElementRef, Input, OnChanges, Renderer2 } from '@angular/core';

@Directive({
  standalone: false,
  selector: '[dynamicTextColor]'
})
export class DynamicTextColorDirective implements OnChanges {
  @Input('dynamicTextColor') backgroundColor: string = "#007AFF";

  constructor(private el: ElementRef, private renderer: Renderer2) {}

  ngOnChanges() {
    this.updateTextColor();
  }

  private updateTextColor() {
    const color = this.getContrastColor(this.backgroundColor);
    this.renderer.setStyle(this.el.nativeElement, 'color', color);
  }

  private getContrastColor(hexColor: string): string {
    // Convert hex color to RGB
    const rgb = this.hexToRgb(hexColor);

    // Calculate the relative luminance
    const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;

    // Choose white or black depending on the luminance
    return luminance > 0.5 ? '#000' : '#FFF';
  }

  private hexToRgb(hex: string): { r: number, g: number, b: number } {
    hex = hex.replace(/^#/, '');
    const bigint = parseInt(hex, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return { r, g, b };
  }
}
