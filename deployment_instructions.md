# AtendIA Deployment Instructions

## SSH Key Setup

1. Open your GitHub account in a browser: https://github.com/settings/keys
2. Click "New SSH key"
3. In the "Title" field, enter: `AtendIA Local Key`
4. In the "Key" field, paste the entire content below:

```
ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQCysGtyQ5qZXmw/Zm4EPoPupiMDaA66zaLDxOsCf6HjaKNN6nX0YOL8z5OWkTxAkeOitp3Z5Ul7xGmeRDkNQDjI6iQek8/xvnpiP8lr+AP585Pot7Ad//l7/R1u1XsPrxGEcGvG/fetrfZvNIwjWvTTjRfmMfGmBv7Hf2mBhtQ6wVtUlEqzpA9iBzrp8diL/MFDX+s22LdF7s73o0TjKye7GOVyrrJNgY51qaLqeLGJlSza+h8tFSekHWtR9VKOoZIBNR/+uod0qQDCmO6ZrrgyY8up60RYIa8ppaNFo7G4Bu/zNUI0yr8KABLo2xovo9dQEKZFyKIle8llfc9eOCZy/lc5aDMwo67/p9AjU05rn5GFMmLTFG2e1jordTLEO09kYfeEtemi+2+vLX/MCyzbIl54BmX6H+PglVmWZD2g45FqTCXeCHZ0z32UmNZN+dHUpcfq5IObau7C7ffnYXA6+T9xkb5vGEarGHNyiSEZbYp2vOmAloOlMMIypAZd4n0tlKBYTwX/pU3ln8yKCh+XGAa6fOXiHdyyQEiauteFAR98RBpHvhl2vRt5NUEXa6UeklIT8tAy09CTjVQqJ1tBieLdkzH+EjNItdEPghoiRnDyyzbKOaMGvtSvaCPCjpFtLMkNexfCaAsbP6DAW+z/RMFGCpndvyc1aPghFCpoMw== albertodecamargo1986@gmail.com
```

5. Click "Add SSH key"

## Verify SSH Connection

After adding the key, open a terminal and run:

```bash
ssh -T git@github.com
```

You should see:
```
Hi albertodecamargo1986! You've successfully authenticated...
```

## Push to GitHub

Once SSH authentication is working, push your changes:

```bash
git push origin main
```

## Deploy to VPS (Oracle Cloud)

1. Connect to your VPS using the Oracle Cloud private key:

```bash
ssh -i "C:/Users/Eliane F Camargo/Downloads/ssh-key-2026-06-14.key" ubuntu@163.176.211.167
```

2. On the VPS, clone your repository:

```bash
git clone git@github.com:albertodecamargo1986/Atendia.git
```

3. Follow the deployment instructions in the repository to set up the application.

## Notes

- The `.swarm/` directory is ignored in `.gitignore` to prevent temporary SQLite files from being tracked.
- The Oracle Cloud SSH key (`ssh-key-2026-06-14.key`) should be kept secure and never committed to the repository.
- The new GitHub SSH key pair is now properly configured on this machine and ready for use.