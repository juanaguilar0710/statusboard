import { AfterViewInit, Component, ViewChild } from '@angular/core';
import { FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { ModalController, NavParams } from '@ionic/angular';

@Component({
  selector: 'app-searchable-component',
  templateUrl: './searchable-component.component.html',
  styleUrls: ['./searchable-component.component.scss'],
})
export class SearchableComponentComponent implements AfterViewInit {

  @ViewChild('searchInput') searchInput: any;

  data: any = [];
  type: string = '';
  nextToSurgerySelected: any;
  getUserInput:boolean = false;

  form: FormGroup = this._formbuilder.group({
    value: new FormControl('')
  });

  constructor(private modalCtrl: ModalController, private navParams: NavParams, private _formbuilder: FormBuilder) {
    
  }
  ngAfterViewInit(): void {
    this.data = this.navParams.get('data');
    this.type = this.navParams.get('type');
    if(this.navParams.get('selectedValue')){
      const value = this.navParams.get('selectedValue');
      this.form.get('value')?.setValue(value);
      setTimeout(() => {
        const element = document.getElementsByClassName('radio-checked');
        if(element.length > 0){
          element[0].scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        }
      }, 250);
    }

    if(this.navParams.get('customValue')){
      this.searchInput.value = this.navParams.get('customValue');
      this.getUserInput = true;
    }
  }

  onInputChange() { 
    this.getUserInput = true;
    switch (this.type) {
      case 'comments':
        this.data = this.navParams.get('data').filter((item: any) => {
          return item.short_description.toLowerCase().indexOf(this.searchInput.value.toLowerCase()) > -1
        })
        break;
      case 'surgeon':
        this.data = this.navParams.get('data').filter((item: any) => {
          return item.name.toLowerCase().indexOf(this.searchInput.value.toLowerCase()) > -1
        })
        break;
      case 'operating_room':
        this.data = this.navParams.get('data').filter((item: any) => {
          return item.name.toLowerCase().indexOf(this.searchInput.value.toLowerCase()) > -1
        })
        break;
      case 'procedure':
        this.data = this.navParams.get('data').filter((item: any) => {
          return item.name.toLowerCase().indexOf(this.searchInput.value.toLowerCase()) > -1
        })
        break;
      default:
        break;
    }
    // this.filteredList = this.list.filter((item: string) => {
    //   return item.toLowerCase().indexOf(this.searchInput.toLowerCase()) > -1
    // })
  }

  dataSelected() {
    this.getUserInput = false;
  }

  update() {
    this.modalCtrl.dismiss({ value: this.form.value, textFromInput: this.getUserInput ? this.searchInput.value : null});
  }

  onItemClick(item: any) {
    this.modalCtrl.dismiss({ item: item })
  }

  closeModal() {
    this.modalCtrl.dismiss();
  }

}
