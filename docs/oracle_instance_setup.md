# Oracle Cloud VM Setup Guide

Follow this guide in your browser to spin up the Oracle Cloud Always Free ARM Instance and configure the network.

---

## 🖥️ 1. Create the Compute Instance

1. Log into your **[Oracle Cloud Console](https://cloud.oracle.com)**.
2. Open the navigation menu (top-left) and select **Compute** ➔ **Instances**.
3. Click **Create instance**.
4. Configure the following fields:
   * **Name**: `nexgenhost-worker-lagos` (or similar)
   * **Placement**: Select any Availability Domain (default is fine).
   * **Image**: Click **Edit**, select **Ubuntu** OS, and choose version **Ubuntu 22.04** (do not use 24.04 or Oracle Linux as the setup scripts are tailored for Ubuntu 22.04 LTS).
   * **Shape**:
     1. Click **Edit shape** or **Change shape**.
     2. Select **Ampere** (ARM-based processor).
     3. Choose **VM.Standard.A1.Flex**.
     4. Set **OCPUs** to `4` and **Memory (GB)** to `24` (this is Oracle's Always Free maximum limits).
   * **Networking**:
     * Keep default VCN and Subnet selection (it will automatically create a public subnet).
     * Set **Public IPv4 Address** to **Assign a public IPv4 address** (default).
   * **SSH Keys**:
     * Select **Generate a key pair for me** or **Upload public key**.
     * **IMPORTANT**: If you generate it, download both the **Private Key** and the **Public Key**. Save them immediately.
     * Copy the downloaded private key file to your local computer's ssh folder:
       ```bash
       mv ~/Downloads/ssh-key-*.key ~/.ssh/oracle_nexhost
       chmod 600 ~/.ssh/oracle_nexhost
       ```
   * **Boot Volume**:
     * Scroll down to **Boot volume** and check **Specify a custom boot volume size**.
     * Set **Boot volume size (GB)** to `200` (this is the maximum Always Free size and gives your Docker builder plenty of storage).

5. Click **Create** at the bottom.

---

## 🔒 2. Open Ports 80 & 443 in VCN Security List

For traffic to reach your Hginx/Docker services, you must open ports 80 and 443 in the Oracle Virtual Cloud Network (VCN) firewall.

1. On the Instance Details page, scroll down to the **Instance access** or **Primary VNIC** section.
2. Click on the link for the **Subnet** (e.g., `subnet-xxxxxx`).
3. In the Subnet page, click on the **Default Security List** (e.g., `Default Security List for vcn-xxxxxx`).
4. Click **Add Ingress Rules**.
5. Add the following rules:

### Ingress Rule for HTTP
* **Source Type**: `CIDR`
* **Source CIDR**: `0.0.0.0/0`
* **IP Protocol**: `TCP`
* **Source Port Range**: `All` (leave blank)
* **Destination Port Range**: `80`
* **Description**: `HTTP for NexGenHost Web Traffic`

### Ingress Rule for HTTPS
* **Source Type**: `CIDR`
* **Source CIDR**: `0.0.0.0/0`
* **IP Protocol**: `TCP`
* **Source Port Range**: `All` (leave blank)
* **Destination Port Range**: `443`
* **Description**: `HTTPS for NexGenHost Web Traffic`

6. Click **Add Ingress Rules**.

---

## 📡 3. Retrieve public IP

Once the instance state changes from `PROVISIONING` to `RUNNING`:
1. Copy the **Public IP Address** (e.g., `129.x.y.z`).
2. Test connection from your terminal:
   ```bash
   ssh -i ~/.ssh/oracle_nexhost ubuntu@<ORACLE_VM_IP>
   ```

---

### Once you have the IP, reply with it so we can run the bootstrap script!
