
# Gostal - a minimal web push notifications service

Trigger browser and mobile push notifications by a custom HTTPS request using
this go microservice.

![](screenshot.png)

```sh
$ PORT=3061 gostal "gostal@lipautz.org"
> Using credentials.json
> Using subscribers.db
$ gostal -help
> ...
```

vapid keys stored, generated on start...

```json
{
  privateKey: "...",
  publicKey: "..."
}
```

[web-push]: https://developers.google.com/web/fundamentals/push-notifications/ "Web Push Notifications: Timely, Relevant, and Precise"
