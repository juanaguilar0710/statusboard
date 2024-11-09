import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RequestsService } from '../api/requests.service';
import { Toast } from '@capacitor/toast';
import { Router } from '@angular/router';
import { Preferences } from '@capacitor/preferences';
import { NotificationService } from '../api/notification.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
})
export class LoginPage implements OnInit {

  showPassword: boolean = false;
  loading: boolean = false;
  form: FormGroup = this._formbuilder.group({
    username: [null, [Validators.required, Validators.minLength(3)]],
    password: [null, [Validators.required, Validators.minLength(3)]],
  });

  constructor(private _formbuilder: FormBuilder,
    private requestsService: RequestsService,
    private notificationService: NotificationService,
    private router: Router) { }

  ngOnInit() {
  }

  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  async login() {
    this.loading = true;
    this.requestsService.login(this.form.value).then(async (response: any) => {
      console.log(response);
      
      this.loading = false;
      if (response.status === 200) {
        const user = response.data.user;        
        if (user.roles.length > 0 && (user.roles.find((r: any) => r.name.toLowerCase() == 'administrator') || user.roles.find((r: any) => r.name.toLowerCase() == 'manager'))) {
          this.requestsService.setToken(response.data.jwt.access_token);
          this.requestsService.setAdminToken(response.data.jwt.access_token);
          
          Preferences.set({
            key: 'admin',
            value: JSON.stringify(response.data)
          });

          
          Preferences.set({
            key: 'branch',
            value: JSON.stringify(response.data.user.branch)
          });
          
          
          Preferences.set({
            key: 'waiting_rooms',
            value: JSON.stringify(response.data.user.waiting_rooms)
          });
          
          Toast.show({
            text: 'Login successful',
            duration: 'long'
          });

          this.router.navigate(['/configuration'], { replaceUrl: true });
          
        } else {
          this.notificationService.showError('Insufficient permissions.',6000);
        }
      } else {
        await Toast.show({
          text: 'Login failed',
          duration: 'long'
        });
        this.notificationService.showError('Incorrect username or password.',6000);
      }
    });
  }

}
